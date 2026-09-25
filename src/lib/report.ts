import { anthropic, REASONING_MODEL } from "./anthropic";
import { computeGapAnalysis, latestIngestedRun, type SkillDemand } from "./analysis";
import { skillKey } from "./skills";
import { supabase } from "./supabase";

// Claude Sonnet 5 pricing, USD per million tokens.
const INPUT_COST_PER_MTOK = 2;
const OUTPUT_COST_PER_MTOK = 10;

// What gets saved in reports.data, so the next report can compute trends.
interface ReportData {
  totalRoles: number;
  companies?: string[]; // companies with in-scope roles; missing on reports before this field existed
  skills: { skill: string; share: number; postings: number; required: number }[];
}

const SYSTEM_PROMPT = `You write a personalized job market report for an early-career software engineer. You're given skill demand statistics computed from real, currently open entry-level job postings (roles asking for 2 or fewer years of experience), the engineer's skills from their resume, and, when available, how demand changed since the previous report.

Write the report in Markdown with these sections:

# Job Market Report: <date>

## Summary
Three or four sentences: where the engineer stands, and the single most valuable thing to work on next.

## What the market wants
The 8 or so most in-demand skills. For each: its share of roles, how many roles require it (versus listing it as nice to have), which companies ask for it, and whether the engineer has it. If trend data exists, call out notable rises and drops. If this is the first report, say trends will appear after the next run.

Changes since the last report come from two sources: the market itself, and companies being added to the watchlist. Check companies_new_since_last_report. If new companies were added, attribute shifts they could explain to them (a new company with many C++ roles raises C++'s share without the market changing), and only call something a market trend if it isn't explained by the new companies. If the new companies are unknown, say trends are unreliable for that reason.

## Your biggest gaps
The gaps worth closing, in priority order. Weigh how often a skill is required (not just mentioned), how many different companies want it, and how quickly someone with this background could credibly learn it. Say briefly why each one ranks where it does. Point out any listed gap that is weaker than it looks (for example, only nice to have, or mostly from one company).

## Project ideas
Exactly 3 projects. Each should close two or more of the top gaps, build on skills the engineer already has so it's realistic, fit in 2 to 4 weeks of evenings and weekends, and produce something demonstrable for a portfolio. For each give: a name, a two-sentence pitch, the gaps it covers, a short milestone list, and a resume bullet the engineer could write once it's done.

## Study plan
A prioritized list of topics, each with why it matters for these postings and a concrete way to study it (a well-known book, course, or exercise). Name resources, but don't include URLs.

## About this data
One short paragraph on the data's limits: how many roles, how many companies, and any skew you notice.

Rules:
- Use only the numbers in the data. Never invent statistics, companies, or trends.
- Be direct and specific; this is for one person, not a general audience.`;

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export interface GeneratedReport {
  reportId: number;
  contentMd: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Builds the gap analysis, asks Claude Sonnet to turn it into a report, and
// stores the result in `reports`, tied to the given run or the latest ingested one.
export async function generateReport(options: { runId?: number } = {}): Promise<GeneratedReport> {
  const analysis = await computeGapAnalysis();
  if (analysis.resumeSkills.length === 0) throw new Error("resume_skills is empty; run `npm run resume` first");
  const onResume = new Set(analysis.resumeSkills.map(skillKey));

  const runId = options.runId ?? (await latestIngestedRun()).id;
  const { data: previous, error: previousError } = await supabase
    .from("reports")
    .select("created_at, data")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;

  const previousData = previous?.data as ReportData | null | undefined;
  const previousShares = new Map(previousData?.skills.map((s) => [skillKey(s.skill), s.share]) ?? []);

  const describe = (s: SkillDemand) => {
    const before = previousShares.get(skillKey(s.skill));
    return {
      skill: s.skill,
      share_of_roles: pct(s.share),
      roles: s.postings,
      roles_requiring_it: s.required,
      companies: s.companies.slice(0, 6),
      company_count: s.companies.length,
      on_resume: onResume.has(skillKey(s.skill)),
      ...(previousData && {
        change_since_last_report:
          before === undefined ? "new in top skills" : `${Math.round((s.share - before) * 100)} percentage points`,
      }),
    };
  };

  const companies = [...new Set(analysis.skills.flatMap((s) => s.companies))].sort();
  const newCompanies = previousData
    ? previousData.companies
      ? companies.filter((c) => !previousData.companies!.includes(c))
      : "unknown (the previous report didn't record its companies)"
    : null;
  const promptData = {
    date: new Date().toISOString().slice(0, 10),
    open_roles: analysis.totalPostings,
    companies_with_roles: companies.length,
    previous_report_date: previous?.created_at.slice(0, 10) ?? null,
    companies_new_since_last_report: newCompanies,
    top_skills: analysis.skills.slice(0, 30).map(describe),
    gaps: analysis.gaps.slice(0, 15).map(describe),
    resume_skills: analysis.resumeSkills,
  };

  // Streaming avoids HTTP timeouts on long outputs; finalMessage() collects the whole response.
  const response = await anthropic.messages
    .stream({
      model: REASONING_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `<data>\n${JSON.stringify(promptData, null, 2)}\n</data>\n\nWrite the report.`,
        },
      ],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The model declined to write the report");
  if (response.stop_reason === "max_tokens") throw new Error("The report hit max_tokens before finishing");
  const contentMd = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const data: ReportData = {
    totalRoles: analysis.totalPostings,
    companies,
    skills: analysis.skills
      .slice(0, 100)
      .map(({ skill, share, postings, required }) => ({ skill, share, postings, required })),
  };
  const { data: saved, error: saveError } = await supabase
    .from("reports")
    .insert({ run_id: runId, model: REASONING_MODEL, content_md: contentMd, data })
    .select("id")
    .single();
  if (saveError) throw saveError;

  const { input_tokens: inputTokens, output_tokens: outputTokens } = response.usage;
  return {
    reportId: saved.id,
    contentMd,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * INPUT_COST_PER_MTOK + outputTokens * OUTPUT_COST_PER_MTOK) / 1_000_000,
  };
}
