"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { checkPassword, isAdmin, SESSION_COOKIE } from "@/lib/auth";
import { isStage, runStage } from "@/lib/pipeline";
import { FREQUENCIES, savePipelineSettings, type Frequency } from "@/lib/settings";
import { errorMessage } from "@/lib/errors";

// Server Functions: the browser calls these like normal functions, but they
// run on the server. Every one that changes something checks isAdmin() itself,
// because anyone can call a Server Function directly, not just through our UI.
// They return errors instead of throwing, since thrown messages are hidden in production.

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = checkPassword(String(formData.get("password") ?? ""));
  if (!token) return { ok: false, error: "Wrong password." };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  refresh();
  return { ok: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  refresh();
}

export async function saveSchedule(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Sign in first." };

  const frequency = String(formData.get("frequency"));
  const weeklyDay = Number(formData.get("weekly_day"));
  if (!(FREQUENCIES as readonly string[]).includes(frequency)) return { ok: false, error: "Invalid frequency." };
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6) return { ok: false, error: "Invalid day." };

  try {
    await savePipelineSettings(frequency as Frequency, weeklyDay);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  refresh();
  return { ok: true };
}

export type StageActionResult =
  | { ok: true; runId: number | null; summary: Record<string, unknown> }
  | { ok: false; error: string };

// Runs one pipeline stage. The dashboard calls this once per stage in order,
// because the whole pipeline takes longer than one request may run.
export async function runPipelineStage(stage: string, runId?: number): Promise<StageActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Sign in first." };
  if (!isStage(stage)) return { ok: false, error: `Unknown stage "${stage}".` };
  if (runId !== undefined && !Number.isInteger(runId)) return { ok: false, error: "Invalid run id." };

  try {
    const result = await runStage(stage, { runId });
    return { ok: true, runId: result.runId, summary: result.summary };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
