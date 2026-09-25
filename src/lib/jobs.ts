import { latestIngestedRun } from "./analysis";
import { canonicalSkills, skillKey } from "./skills";
import { supabase } from "./supabase";

// Open roles to apply to, shaped for the Jobs page. Postings of the same
// role in different locations (same company and title) are grouped into one
// Job with a link per location, since each location is its own application.

const MAX_YEARS = 2;

export interface JobLocation {
  location: string;
  url: string | null;
}

export interface Job {
  key: string;
  title: string;
  company: string;
  locations: JobLocation[];
  postedAt: string | null; // earliest posting date across locations
  firstSeenAt: string; // when this pipeline first found it
  isNew: boolean; // first found by the latest ingestion run
  yearsExperience: number | null; // null: not stated, or not extracted yet
  analyzed: boolean; // has extracted fields
  requiredSkills: string[];
  missingSkills: string[]; // required skills not on the resume
}

interface PostingRow {
  id: number;
  title: string;
  location: string | null;
  url: string | null;
  posted_at: string | null;
  first_seen_at: string;
  first_seen_run_id: number | null;
  companies: { name: string } | null;
  extracted_fields: { required_skills: string[]; years_experience: number | null } | null;
}

export async function getOpenJobs(): Promise<{ jobs: Job[]; latestRunAt: string }> {
  const latestRun = await latestIngestedRun();

  const [{ data, error }, { data: resume, error: resumeError }] = await Promise.all([
    supabase
      .from("postings")
      .select(
        "id, title, location, url, posted_at, first_seen_at, first_seen_run_id, companies(name), extracted_fields(required_skills, years_experience)",
      )
      .gte("last_seen_at", latestRun.started_at),
    supabase.from("resume_skills").select("skill"),
  ]);
  if (error) throw error;
  if (resumeError) throw resumeError;

  const onResume = new Set(canonicalSkills(resume.map((r) => r.skill)).map(skillKey));
  const groups = new Map<string, Job>();

  for (const p of data as unknown as PostingRow[]) {
    const years = p.extracted_fields?.years_experience ?? null;
    if (years !== null && years > MAX_YEARS) continue;

    const company = p.companies?.name ?? "Unknown";
    const key = `${company}:${p.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    // Some boards use placeholder text like "N/A" instead of leaving the location empty.
    const place = p.location?.trim();
    const location = {
      location: place && !/^(n\/?a|tbd|none|-)$/i.test(place) ? place : "Location not listed",
      url: p.url,
    };
    const existing = groups.get(key);

    if (existing) {
      existing.locations.push(location);
      if (p.posted_at && (!existing.postedAt || p.posted_at < existing.postedAt)) existing.postedAt = p.posted_at;
      if (p.first_seen_at < existing.firstSeenAt) existing.firstSeenAt = p.first_seen_at;
      existing.isNew &&= p.first_seen_run_id === latestRun.id;
      continue;
    }

    const required = canonicalSkills(p.extracted_fields?.required_skills ?? []);
    groups.set(key, {
      key,
      title: p.title,
      company,
      locations: [location],
      postedAt: p.posted_at,
      firstSeenAt: p.first_seen_at,
      isNew: p.first_seen_run_id === latestRun.id,
      yearsExperience: years,
      analyzed: p.extracted_fields !== null,
      requiredSkills: required,
      missingSkills: required.filter((s) => !onResume.has(skillKey(s))),
    });
  }

  for (const job of groups.values()) {
    job.locations.sort((a, b) => a.location.localeCompare(b.location));
    // Number repeated labels ("Location not listed (2)") so each link is distinguishable.
    const seen = new Map<string, number>();
    for (const loc of job.locations) {
      const n = (seen.get(loc.location) ?? 0) + 1;
      seen.set(loc.location, n);
      if (n > 1) loc.location = `${loc.location} (${n})`;
    }
  }
  return { jobs: [...groups.values()], latestRunAt: latestRun.started_at };
}
