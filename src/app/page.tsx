import { connection } from "next/server";
import { isAdmin, passwordConfigured } from "@/lib/auth";
import { getPipelineSettings, type PipelineSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { PipelineControls } from "./pipeline-controls";
import { errorMessage } from "@/lib/errors";

// Manual runs call Server Functions from this page; each runs one pipeline
// stage, which can take a few minutes. 300s is Vercel Hobby's maximum.
export const maxDuration = 300;

interface Run {
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

const STATUS_STYLES: Record<Run["status"], string> = {
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default async function Home() {
  // Render on every request, never at build time: runs and settings change constantly.
  await connection();
  const [admin, settingsResult, runsResult] = await Promise.all([
    isAdmin(),
    getPipelineSettings().then(
      (settings): { settings: PipelineSettings; error: null } => ({ settings, error: null }),
      (err: unknown) => ({ settings: null, error: errorMessage(err) }),
    ),
    supabase
      .from("runs")
      .select(
        "id, started_at, status, postings_fetched, postings_new, postings_extracted, companies_added, cost_usd, error",
      )
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  const runs = (runsResult.data ?? []) as Run[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">SWE Job Market Agent</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Entry-level software engineering postings, the skills they ask for, and how your resume compares.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="mb-4 text-base font-semibold">Pipeline</h2>
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
      </section>

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="mb-4 text-base font-semibold">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-neutral-500">No runs yet.</p>
        ) : (
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
        )}
      </section>
    </main>
  );
}
