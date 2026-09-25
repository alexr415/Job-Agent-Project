import { computeGapAnalysis, type GapAnalysis } from "./analysis";
import { errorMessage } from "./errors";
import { skillKey } from "./skills";
import { supabase } from "./supabase";

// Everything the dashboard page shows, loaded in one place. Each part fails
// independently, so a missing report doesn't blank out the whole page.

export interface SkillBar {
  skill: string;
  share: number; // percent of roles, 0-100
  roles: number;
  required: number;
  companies: string[];
  onResume: boolean;
}

export interface TrendPoint {
  label: string; // x-axis label for one report
  [skill: string]: number | string;
}

export interface Run {
  id: number;
  started_at: string;
  status: "running" | "succeeded" | "failed";
  postings_fetched: number;
  postings_new: number;
  postings_extracted: number;
  companies_added: number;
  cost_usd: number;
  error: string | null;
}

export interface DashboardData {
  analysis: { totalRoles: number; topSkills: SkillBar[]; gaps: SkillBar[]; matches: SkillBar[] } | null;
  analysisError: string | null;
  companies: { total: number; addedByScout: number };
  trend: { skills: string[]; points: TrendPoint[] };
  latestReport: { id: number; created_at: string; content_md: string } | null;
  runs: Run[];
}

const TREND_SERIES = 4; // lines on the trend chart; past 4, direct labels stop working

function toBar(s: GapAnalysis["skills"][number], onResume: Set<string>): SkillBar {
  return {
    skill: s.skill,
    share: Math.round(s.share * 1000) / 10,
    roles: s.postings,
    required: s.required,
    companies: s.companies,
    onResume: onResume.has(skillKey(s.skill)),
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [analysisResult, companiesResult, scoutResult, reportsResult, runsResult] = await Promise.all([
    computeGapAnalysis().then(
      (a) => ({ analysis: a, error: null }),
      (err: unknown) => ({ analysis: null, error: errorMessage(err) }),
    ),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("added_by", "scout"),
    supabase.from("reports").select("id, created_at, content_md, data").order("created_at", { ascending: true }),
    supabase
      .from("runs")
      .select(
        "id, started_at, status, postings_fetched, postings_new, postings_extracted, companies_added, cost_usd, error",
      )
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const a = analysisResult.analysis;
  const onResume = new Set(a?.resumeSkills.map(skillKey) ?? []);
  const reports = reportsResult.data ?? [];

  // Trend: the current top skills' share in every report that saved its numbers.
  const trendSkills = a?.skills.slice(0, TREND_SERIES).map((s) => s.skill) ?? [];
  const points: TrendPoint[] = reports
    .filter((r) => r.data?.skills)
    .map((r) => {
      const shares = new Map(
        (r.data.skills as { skill: string; share: number }[]).map((s) => [skillKey(s.skill), s.share]),
      );
      const date = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const point: TrendPoint = { label: `${date} · #${r.id}` };
      for (const skill of trendSkills) {
        const share = shares.get(skillKey(skill));
        if (share !== undefined) point[skill] = Math.round(share * 1000) / 10;
      }
      return point;
    });

  const latest = reports.at(-1);
  return {
    analysis: a && {
      totalRoles: a.totalPostings,
      topSkills: a.skills.slice(0, 20).map((s) => toBar(s, onResume)),
      gaps: a.gaps.slice(0, 10).map((s) => toBar(s, onResume)),
      matches: a.matches.slice(0, 10).map((s) => toBar(s, onResume)),
    },
    analysisError: analysisResult.error,
    companies: { total: companiesResult.count ?? 0, addedByScout: scoutResult.count ?? 0 },
    trend: { skills: trendSkills, points },
    latestReport: latest ? { id: latest.id, created_at: latest.created_at, content_md: latest.content_md } : null,
    runs: (runsResult.data ?? []) as Run[],
  };
}
