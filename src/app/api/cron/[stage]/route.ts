import type { NextRequest } from "next/server";
import { isStage, runStage } from "@/lib/pipeline";
import { getPipelineSettings, stagesDueToday } from "@/lib/settings";
import { errorMessage } from "@/lib/errors";

// Vercel's maximum on the Hobby plan. Stages stop starting new work well before this.
export const maxDuration = 300;

// Called by Vercel Cron every day (see vercel.json). Vercel sends the
// project's CRON_SECRET as a bearer token, so nobody else can trigger paid API
// calls. Whether the stage actually runs depends on the schedule set on the
// dashboard (pipeline_settings), since vercel.json can't change at runtime.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cron/[stage]">) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stage } = await ctx.params;
  if (!isStage(stage)) return Response.json({ error: `Unknown stage "${stage}"` }, { status: 404 });

  try {
    const settings = await getPipelineSettings();
    const due = stagesDueToday(settings);
    if (!due.includes(stage)) {
      const reason = settings.frequency === "off" ? "schedule is off" : `not scheduled today (${settings.frequency})`;
      console.log(`[cron] ${stage} skipped: ${reason}`);
      return Response.json({ stage, skipped: reason });
    }

    // The last stage due today closes the day's run.
    const result = await runStage(stage, { closeRun: due.at(-1) === stage });
    console.log(`[cron] ${stage} finished`, JSON.stringify(result));
    return Response.json(result);
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[cron] ${stage} failed:`, message);
    return Response.json({ stage, error: message }, { status: 500 });
  }
}
