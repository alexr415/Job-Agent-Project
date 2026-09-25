import { fetchPostings, type AtsProvider, type NormalizedPosting } from "./ats";
import { entryLevelReason } from "./entry-level";
import { supabase } from "./supabase";
import { errorMessage } from "./errors";

interface Company {
  id: number;
  name: string;
  slug: string;
  ats_provider: AtsProvider;
}

export interface CompanyIngestResult {
  company: string;
  totalJobs: number;
  entryLevel: number;
  byTitle: number; // entry-level because of the title
  byYears: number; // entry-level because the description asks for <= 2 years
  new: number;
  error?: string;
}

// Upserts one company's entry-level postings. New postings are inserted with
// the run that first saw them; ones already stored just get last_seen_at bumped,
// so later phases can tell which postings are still open.
async function savePostings(company: Company, postings: NormalizedPosting[], runId: number): Promise<number> {
  if (postings.length === 0) return 0;

  const ids = postings.map((p) => p.sourceJobId);
  const { data: existing, error: selectError } = await supabase
    .from("postings")
    .select("source_job_id")
    .eq("company_id", company.id)
    .in("source_job_id", ids);
  if (selectError) throw selectError;

  const existingIds = new Set(existing.map((row) => row.source_job_id));
  const fresh = postings.filter((p) => !existingIds.has(p.sourceJobId));

  if (fresh.length > 0) {
    const { error } = await supabase.from("postings").insert(
      fresh.map((p) => ({
        company_id: company.id,
        source_job_id: p.sourceJobId,
        title: p.title,
        location: p.location,
        url: p.url,
        description: p.description,
        posted_at: p.postedAt,
        first_seen_run_id: runId,
      })),
    );
    if (error) throw error;
  }

  if (existingIds.size > 0) {
    const { error } = await supabase
      .from("postings")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("company_id", company.id)
      .in("source_job_id", [...existingIds]);
    if (error) throw error;
  }

  return fresh.length;
}

async function ingestCompany(company: Company, runId: number): Promise<CompanyIngestResult> {
  try {
    const all = await fetchPostings(company.ats_provider, company.slug);
    const reasons = all.map((p) => entryLevelReason(p));
    const entryLevel = all.filter((_, i) => reasons[i] !== null);
    const added = await savePostings(company, entryLevel, runId);
    return {
      company: company.name,
      totalJobs: all.length,
      entryLevel: entryLevel.length,
      byTitle: reasons.filter((r) => r === "title").length,
      byYears: reasons.filter((r) => r === "years").length,
      new: added,
    };
  } catch (err) {
    // One broken board shouldn't sink the whole run.
    const message = errorMessage(err);
    return { company: company.name, totalJobs: 0, entryLevel: 0, byTitle: 0, byYears: 0, new: 0, error: message };
  }
}

// Fetches every active company's board, keeps entry-level SWE postings, and
// adds the counts to the given run. The caller owns the run's status.
export async function ingestAll(runId: number): Promise<CompanyIngestResult[]> {
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, slug, ats_provider")
    .eq("active", true)
    .order("name");
  if (error) throw error;

  // A few boards at a time: fast, without hammering any one API.
  const results: CompanyIngestResult[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY) as Company[];
    results.push(...(await Promise.all(batch.map((c) => ingestCompany(c, runId)))));
  }

  const failures = results.filter((r) => r.error);
  const { error: updateError } = await supabase
    .from("runs")
    .update({
      postings_fetched: results.reduce((sum, r) => sum + r.entryLevel, 0),
      postings_new: results.reduce((sum, r) => sum + r.new, 0),
      error: failures.length ? failures.map((r) => `${r.company}: ${r.error}`).join("\n") : null,
    })
    .eq("id", runId);
  if (updateError) throw updateError;

  return results;
}

// Standalone ingestion (`npm run ingest`): creates its own run and records
// whether it succeeded.
export async function runIngestion(): Promise<{ runId: number; results: CompanyIngestResult[] }> {
  const { data: run, error: runError } = await supabase.from("runs").insert({}).select("id").single();
  if (runError) throw runError;

  try {
    const results = await ingestAll(run.id);
    await supabase.from("runs").update({ finished_at: new Date().toISOString(), status: "succeeded" }).eq("id", run.id);
    return { runId: run.id, results };
  } catch (err) {
    await supabase
      .from("runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error: errorMessage(err) })
      .eq("id", run.id);
    throw err;
  }
}
