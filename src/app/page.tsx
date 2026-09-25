import Link from "next/link";
import { connection } from "next/server";
import { isAdmin, passwordConfigured } from "@/lib/auth";
import { getDashboardData, type Run, type SkillBar } from "@/lib/dashboard";
import { errorMessage } from "@/lib/errors";
import { daysSincePosted, postedDate, requestTime, WEEK_DAYS } from "@/lib/freshness";
import { getOpenJobs, type Job } from "@/lib/jobs";
import { getPipelineSettings, type PipelineSettings } from "@/lib/settings";
import { SkillDemandChart, SkillTrendChart } from "./components/charts";
import { PostedBadge } from "./components/posted-badge";
import { ReportView } from "./components/report-view";
import { PipelineControls } from "./pipeline-controls";

// Manual runs call Server Functions from this page; each runs one pipeline
// stage, which can take a few minutes. 300s is Vercel Hobby's maximum.
export const maxDuration = 300;

const STATUS_STYLES: Record<Run["status"], string> = {
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function formatDate(iso: string, withTime = true): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
    timeZone: "UTC",
  });
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, detail, href }: { label: string; value: string; detail?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
    </>
  );
  const className = "rounded-xl border border-neutral-200 p-4 dark:border-neutral-800";
  return href ? (
    <Link href={href} className={`${className} transition hover:border-neutral-400 dark:hover:border-neutral-600`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function SkillTable({ skills, empty }: { skills: SkillBar[]; empty: string }) {
  if (skills.length === 0) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <th className="py-2 pr-3 font-medium">Skill</th>
            <th className="py-2 pr-3 text-right font-medium">Share</th>
            <th className="py-2 pr-3 text-right font-medium">Require it</th>
            <th className="py-2 font-medium">Top companies</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {skills.map((s) => (
            <tr key={s.skill} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
              <td className="py-2 pr-3 font-medium">{s.skill}</td>
              <td className="py-2 pr-3 text-right">{s.share}%</td>
              <td className="py-2 pr-3 text-right">{s.required}</td>
              <td className="py-2 text-neutral-500 dark:text-neutral-400">
                {s.companies.slice(0, 3).join(", ")}
                {s.companies.length > 3 && ` +${s.companies.length - 3}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The newest roles, so the dashboard leads with what to apply to today.
function FreshOpenings({ jobs, total, now }: { jobs: Job[]; total: number; now: number }) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing posted in the last week.{" "}
        <Link href="/jobs" className="underline underline-offset-2">
          Browse all {total} open roles
        </Link>
        .
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {jobs.map((job) => {
          const have = job.requiredSkills.length - job.missingSkills.length;
          return (
            <li key={job.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <PostedBadge job={job} now={now} />
              <a
                href={job.locations[0]?.url ?? "/jobs"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {job.title}
              </a>
              <span className="text-neutral-500 dark:text-neutral-400">
                {job.company} · {job.locations[0]?.location}
                {job.locations.length > 1 && ` +${job.locations.length - 1}`}
              </span>
              {job.analyzed && job.requiredSkills.length > 0 && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 sm:ml-auto">
                  {have}/{job.requiredSkills.length} skills
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/jobs" className="mt-3 inline-block text-sm text-blue-700 hover:underline dark:text-blue-400">
        See all {total} open roles →
      </Link>
    </>
  );
}

function RunHistory({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return <p className="text-sm text-neutral-500">No runs yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <th className="py-2 pr-3 font-medium">Run</th>
            <th className="py-2 pr-3 font-medium">Started</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 text-right font-medium">Postings</th>
            <th className="py-2 pr-3 text-right font-medium">New</th>
            <th className="py-2 pr-3 text-right font-medium">Extracted</th>
            <th className="py-2 pr-3 text-right font-medium">Companies added</th>
            <th className="py-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
              <td className="py-2 pr-3 text-neutral-500">#{run.id}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(run.started_at)}</td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[run.status]}`}
                  title={run.error ?? undefined}
                >
                  {run.status}
                </span>
              </td>
              <td className="py-2 pr-3 text-right">{run.postings_fetched}</td>
              <td className="py-2 pr-3 text-right">{run.postings_new}</td>
              <td className="py-2 pr-3 text-right">{run.postings_extracted}</td>
              <td className="py-2 pr-3 text-right">{run.companies_added}</td>
              <td className="py-2 text-right">${Number(run.cost_usd).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Home() {
  // Render on every request, never at build time: the data changes with every run.
  await connection();
  const now = requestTime();
  const [data, admin, settingsResult, jobsResult] = await Promise.all([
    getDashboardData(),
    isAdmin(),
    getPipelineSettings().then(
      (settings): { settings: PipelineSettings; error: null } => ({ settings, error: null }),
      (err: unknown) => ({ settings: null, error: errorMessage(err) }),
    ),
    getOpenJobs().catch(() => null),
  ]);
  const { analysis, trend, latestReport, runs, companies } = data;
  const allJobs = jobsResult?.jobs ?? [];
  const postedThisWeek = allJobs
    .filter((job) => daysSincePosted(job, now) <= WEEK_DAYS)
    .sort((a, b) => postedDate(b).localeCompare(postedDate(a)));
  const lastRun = runs[0];
  const top20Covered = analysis?.topSkills.filter((s) => s.onResume).length ?? 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Open entry-level software roles (new grad, or 2 or fewer years of experience), the skills they ask for,
          and how your resume compares.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Posted this week"
          value={jobsResult ? String(postedThisWeek.length) : "–"}
          detail={`of ${allJobs.length} open roles · browse →`}
          href="/jobs"
        />
        <Stat
          label="Companies watched"
          value={String(companies.total)}
          detail={`${companies.addedByScout} found by the scout agent`}
        />
        <Stat
          label="Top 20 skills you have"
          value={analysis ? `${top20Covered} / ${analysis.topSkills.length}` : "–"}
        />
        <Stat
          label="Last run"
          value={lastRun ? formatDate(lastRun.started_at, false) : "–"}
          detail={lastRun && `${lastRun.status} · $${Number(lastRun.cost_usd).toFixed(2)}`}
        />
      </div>

      <Card
        title="Fresh openings"
        subtitle="Posted in the last week, newest first. Applying early gives you the best shot."
      >
        {jobsResult ? (
          <FreshOpenings jobs={postedThisWeek.slice(0, 10)} total={allJobs.length} now={now} />
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load open roles.</p>
        )}
      </Card>

      {analysis ? (
        <>
          <Card
            title="Most requested skills"
            subtitle="Share of open roles listing each skill as required or nice to have."
          >
            <SkillDemandChart data={analysis.topSkills} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Your biggest gaps" subtitle="In demand and not on your resume.">
              <SkillTable skills={analysis.gaps} empty="No gaps above 3% of roles." />
            </Card>
            <Card title="Your strongest matches" subtitle="In demand and on your resume.">
              <SkillTable skills={analysis.matches} empty="No matches yet. Run `npm run resume`." />
            </Card>
          </div>
        </>
      ) : (
        <Card title="Skills">
          <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load the analysis: {data.analysisError}</p>
        </Card>
      )}

      <Card
        title="Skill trends"
        subtitle="Share of roles for today's top skills, in each report. Changes can come from the market or from new companies on the watchlist."
      >
        {trend.points.length >= 2 ? (
          <SkillTrendChart skills={trend.skills} points={trend.points} />
        ) : (
          <p className="text-sm text-neutral-500">Trends appear once there are at least two reports.</p>
        )}
      </Card>

      <Card
        title="Latest report"
        subtitle={latestReport ? `Report #${latestReport.id}, ${formatDate(latestReport.created_at)}` : undefined}
      >
        {latestReport ? (
          <ReportView markdown={latestReport.content_md} />
        ) : (
          <p className="text-sm text-neutral-500">No report yet.</p>
        )}
      </Card>

      <Card title="Pipeline">
        {settingsResult.settings ? (
          <PipelineControls
            admin={admin}
            passwordConfigured={passwordConfigured()}
            settings={settingsResult.settings}
          />
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load the schedule ({settingsResult.error}). Run{" "}
            <code className="font-mono">supabase/migrations/0002_pipeline_settings.sql</code> in the Supabase SQL
            Editor.
          </p>
        )}
        <h3 className="mt-8 mb-3 text-sm font-medium">Recent runs</h3>
        <RunHistory runs={runs} />
      </Card>
    </main>
  );
}
