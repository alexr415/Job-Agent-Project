import { runExtraction } from "./extract";
import { ingestAll } from "./ingest";
import { generateReport } from "./report";
import { runScout } from "./scout";
import { supabase } from "./supabase";
import { errorMessage } from "./errors";

// The weekly pipeline runs as separate stages, each in its own function
// invocation, because together they take longer than Vercel's 300s limit.
// Stages share one `runs` row: scout opens it, later stages add their
// numbers, and report closes it.
export const STAGES = ["scout", "ingest", "extract", "report"] as const;
export type Stage = (typeof STAGES)[number];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

// How long a stage may keep starting new work, leaving headroom under the
// 300s function limit for in-flight requests to finish.
const STAGE_TIME_BUDGET_MS = 200_000;
// A stage joins a run still open from earlier stages if it started this recently.
const RUN_WINDOW_MS = 12 * 60 * 60 * 1000;

type RunTotals = {
  postings_extracted: number;
  companies_added: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

async function openRun(stage: Stage, runId?: number): Promise<number> {
  if (runId !== undefined) return runId;
  if (stage !== "scout") {
    const { data, error } = await supabase
      .from("runs")
      .select("id")
      .eq("status", "running")
      .gte("started_at", new Date(Date.now() - RUN_WINDOW_MS).toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }
  // Scout always starts a new run; other stages start one if scout didn't run or failed.
  // Any run still marked running is abandoned at this point (a skipped stage,
  // or a manual run whose page was closed), so close it out.
  const { error: closeError } = await supabase
    .from("runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: "Superseded by a newer run" })
    .eq("status", "running");
  if (closeError) throw closeError;

  const { data, error } = await supabase.from("runs").insert({}).select("id").single();
  if (error) throw error;
  return data.id;
}

// Adds a stage's numbers to the run's running totals.
async function addToRun(runId: number, delta: Partial<RunTotals>): Promise<void> {
  const { data, error } = await supabase
    .from("runs")
    .select("postings_extracted, companies_added, input_tokens, output_tokens, cost_usd")
    .eq("id", runId)
    .single();
  if (error) throw error;

  const updated: Partial<RunTotals> = {};
  for (const [key, value] of Object.entries(delta) as [keyof RunTotals, number][]) {
    updated[key] = Number(data[key]) + value;
  }
  const { error: updateError } = await supabase.from("runs").update(updated).eq("id", runId);
  if (updateError) throw updateError;
}

export interface StageResult {
  stage: Stage;
  runId: number;
  summary: Record<string, unknown>;
}

// Runs one stage. Cron invocations omit runId and join (or open) the day's
// run; the dashboard's manual run passes the runId the scout stage returned.
export async function runStage(stage: Stage, options: { runId?: number } = {}): Promise<StageResult> {
  const runId = await openRun(stage, options.runId);
  const deadline = Date.now() + STAGE_TIME_BUDGET_MS;

  try {
    let summary: Record<string, unknown>;
    switch (stage) {
      case "scout": {
        const r = await runScout({ deadline });
        await addToRun(runId, {
          companies_added: r.added.length,
          input_tokens: r.inputTokens,
          output_tokens: r.outputTokens,
          cost_usd: r.costUsd,
        });
        summary = { added: r.added.map((c) => c.name), stopReason: r.stopReason, costUsd: r.costUsd };
        break;
      }
      case "ingest": {
        const results = await ingestAll(runId);
        summary = {
          companies: results.length,
          entryLevel: results.reduce((sum, r) => sum + r.entryLevel, 0),
          new: results.reduce((sum, r) => sum + r.new, 0),
          failed: results.filter((r) => r.error).map((r) => r.company),
        };
        break;
      }
      case "extract": {
        const r = await runExtraction({ deadline });
        await addToRun(runId, {
          postings_extracted: r.succeeded,
          input_tokens: r.inputTokens,
          output_tokens: r.outputTokens,
          cost_usd: r.costUsd,
        });
        summary = { extracted: r.succeeded, failed: r.failures.length, remaining: r.remaining, costUsd: r.costUsd };
        break;
      }
      case "report": {
        const r = await generateReport({ runId });
        await addToRun(runId, { input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd });
        // The report is the last stage, so it closes the run.
        const { error } = await supabase
          .from("runs")
          .update({ status: "succeeded", finished_at: new Date().toISOString() })
          .eq("id", runId);
        if (error) throw error;
        summary = { reportId: r.reportId, costUsd: r.costUsd };
        break;
      }
    }
    return { stage, runId, summary };
  } catch (err) {
    await supabase
      .from("runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: `${stage}: ${errorMessage(err)}`,
      })
      .eq("id", runId);
    throw err;
  }
}
