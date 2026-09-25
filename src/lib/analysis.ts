import { canonicalSkills, skillKey } from "./skills";
import { supabase } from "./supabase";

// A posting is in scope if it asks for this many years or fewer, according to
// the LLM extraction (more reliable than the regex used at ingestion).
const MAX_YEARS = 2;

export interface SkillDemand {
  skill: string;
  postings: number; // roles listing it as required or nice to have
  required: number; // roles listing it as required
  share: number; // postings / total in-scope roles
  companies: string[]; // companies with a role asking for it, most roles first
}

export interface SkillDemandResult {
  totalPostings: number; // unique roles (company + title), not raw postings
  skills: SkillDemand[]; // most in demand first
}

// Counts how many in-scope roles ask for each skill. In scope means still
// open (seen by the latest successful ingestion run) and asking for
// <= MAX_YEARS years of experience. Companies often post the same role once
// per location, so postings with the same company and title count as one
// role; otherwise one company's boilerplate would dominate the counts.
export async function computeSkillDemand(): Promise<SkillDemandResult> {
  const { data: latestRun, error: runError } = await supabase
    .from("runs")
    .select("started_at")
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (runError) throw runError;

  const { data, error } = await supabase
    .from("postings")
    .select(
      "company_id, title, companies(name), extracted_fields!inner(required_skills, nice_to_have_skills, years_experience)",
    )
    .gte("last_seen_at", latestRun.started_at);
  if (error) throw error;

  type Fields = { required_skills: string[]; nice_to_have_skills: string[]; years_experience: number | null };
  const roles = new Map<string, Fields & { company: string }>();
  for (const posting of data) {
    const fields = posting.extracted_fields as unknown as Fields;
    if (fields.years_experience !== null && fields.years_experience > MAX_YEARS) continue;
    const key = `${posting.company_id}:${posting.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const existing = roles.get(key);
    // Merge duplicates' skills in case the copies were extracted slightly differently.
    roles.set(key, {
      company: (posting.companies as unknown as { name: string } | null)?.name ?? "Unknown",
      required_skills: [...(existing?.required_skills ?? []), ...fields.required_skills],
      nice_to_have_skills: [...(existing?.nice_to_have_skills ?? []), ...fields.nice_to_have_skills],
      years_experience: fields.years_experience,
    });
  }
  const inScope = [...roles.values()];

  const counts = new Map<
    string,
    { names: Map<string, number>; companies: Map<string, number>; postings: number; required: number }
  >();
  for (const fields of inScope) {
    const required = new Set(canonicalSkills(fields.required_skills).map(skillKey));
    const all = canonicalSkills([...fields.required_skills, ...fields.nice_to_have_skills]);
    for (const skill of all) {
      const key = skillKey(skill);
      const entry = counts.get(key) ?? { names: new Map(), companies: new Map(), postings: 0, required: 0 };
      entry.names.set(skill, (entry.names.get(skill) ?? 0) + 1);
      entry.companies.set(fields.company, (entry.companies.get(fields.company) ?? 0) + 1);
      entry.postings++;
      if (required.has(key)) entry.required++;
      counts.set(key, entry);
    }
  }

  const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const skills = [...counts.values()]
    .map((entry) => ({
      // Show the most common spelling, e.g. "Frontend Development" over "Frontend development".
      skill: byCount(entry.names)[0],
      companies: byCount(entry.companies),
      postings: entry.postings,
      required: entry.required,
      share: entry.postings / inScope.length,
    }))
    .sort((a, b) => b.postings - a.postings || b.required - a.required);

  return { totalPostings: inScope.length, skills };
}

export interface GapAnalysis extends SkillDemandResult {
  resumeSkills: string[];
  matches: SkillDemand[]; // in demand and on the resume
  gaps: SkillDemand[]; // in demand and not on the resume
}

// Splits in-demand skills into ones the resume covers and ones it doesn't.
// minShare drops the long tail of skills only one or two postings mention.
export async function computeGapAnalysis(minShare = 0.03): Promise<GapAnalysis> {
  const demand = await computeSkillDemand();

  const { data, error } = await supabase.from("resume_skills").select("skill");
  if (error) throw error;
  const resumeSkills = canonicalSkills(data.map((row) => row.skill));
  const onResume = new Set(resumeSkills.map(skillKey));

  const inDemand = demand.skills.filter((s) => s.share >= minShare);
  return {
    ...demand,
    resumeSkills,
    matches: inDemand.filter((s) => onResume.has(skillKey(s.skill))),
    gaps: inDemand.filter((s) => !onResume.has(skillKey(s.skill))),
  };
}
