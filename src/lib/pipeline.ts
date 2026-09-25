import { runExtraction } from "./extract";
import { ingestAll } from "./ingest";
import { generateReport } from "./report";
import { runScout } from "./scout";
import { supabase } from "./supabase";
import { errorMessage } from "./errors";

import { PIPELINE_STAGES, type Stage } from "./schedule";

// The pipeline runs as separate stages, each in its own function invocation,
// because together they take longer than Vercel's 300s limit. Stages share
// one `runs` row: the first stage of the day opens it, later stages add
// their numbers, and the last stage of the day closes it.
export const STAGES = PIPELINE_STAGES;
export type { Stage };

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

async function findOpenRun(): Promise<number | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - RUN_WINDOW_MS).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function countPendingExtractions(): Promise<number> {
  const { count, error } = await supabase
    .from("postings")
    .select("id, extracted_fields!left(posting_id)", { count: "exact", head: true })
    .is("extracted_fields", null);
  if (error) throw error;
  return count ?? 0;
}

async function closeRun(runId: number): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({ status: "succeeded", finished_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}

async function openRun(stage: Stage, runId?: number): Promise<number> {
  if (runId !== undefined) return runId;
  if (stage !== "scout") {
    const open = await findOpenRun();
    if (open !== null) return open;
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
  runId: number | null; // null when the stage had nothing to do and opened no run
  summary: Record<string, unknown>;
}

// Runs one stage. Cron invocations omit runId and join (or open) the day's
// run; the dashboard's manual run passes the runId the scout stage returned.
// closeRun marks the run succeeded afterwards: the cron route sets it on the
// last stage due that day. The report stage always closes the run.
export async function runStage(
  stage: Stage,
  options: { runId?: number; closeRun?: boolean } = {},
): Promise<StageResult> {
  // A second extraction pass with the day's run already closed and nothing
  // left to extract has no work, so it shouldn't open an empty run.
  if (stage === "extract" && options.runId === undefined && (await findOpenRun()) === null) {
    if ((await countPendingExtractions()) === 0) {
      return { stage, runId: null, summary: { extracted: 0, failed: 0, remaining: 0, costUsd: 0 } };
    }
  }

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
        if (options.closeRun) await closeRun(runId);
        break;
      }
      case "ingest": {
        const results = await ingestAll(runId);
        if (options.closeRun) await closeRun(runId);
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
        // If the deadline left postings unextracted, keep the run open for the next pass.
        if (options.closeRun && r.remaining === 0) await closeRun(runId);
        break;
      }
      case "report": {
        const r = await generateReport({ runId });
        await addToRun(runId, { input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd });
        // The report is always the last stage, so it closes the run.
        await closeRun(runId);
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
