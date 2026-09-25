"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { login, logout, runPipelineStage, saveSchedule } from "./actions";
import { scheduleDescription, WEEKDAYS, type Frequency, type PipelineSettings } from "@/lib/schedule";

const buttonClass =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
const inputClass =
  "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";


function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor="password" className="sr-only">
        Dashboard password
      </label>
      <input id="password" name="password" type="password" placeholder="Password" required className={inputClass} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

function ScheduleForm({ settings }: { settings: PipelineSettings }) {
  const [state, action, pending] = useActionState(saveSchedule, null);
  const [frequency, setFrequency] = useState<Frequency>(settings.frequency);
  const [weeklyDay, setWeeklyDay] = useState(settings.weekly_day);
  const changed = frequency !== settings.frequency || weeklyDay !== settings.weekly_day;

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="inline-flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
          <legend className="sr-only">Frequency</legend>
          {(["daily", "weekly", "off"] as const).map((option) => (
            <label
              key={option}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm capitalize transition ${
                frequency === option
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              <input
                type="radio"
                name="frequency"
                value={option}
                checked={frequency === option}
                onChange={() => setFrequency(option)}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </fieldset>

        {frequency === "weekly" && (
          <select
            name="weekly_day"
            aria-label="Day of the week"
            value={weeklyDay}
            onChange={(e) => setWeeklyDay(Number(e.target.value))}
            className={inputClass}
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
        )}
        {frequency !== "weekly" && <input type="hidden" name="weekly_day" value={weeklyDay} />}

        <button type="submit" disabled={pending || !changed} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {scheduleDescription({ frequency, weekly_day: weeklyDay })}
      </p>
      {state && !state.ok && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.ok && !changed && <p className="text-sm text-emerald-600 dark:text-emerald-400">Schedule saved.</p>}
    </form>
  );
}

type StepStatus = "pending" | "running" | "done" | "error";
interface Step {
  stage: "scout" | "ingest" | "extract" | "report";
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { stage: "scout", label: "Find new companies", status: "pending" },
  { stage: "ingest", label: "Fetch postings", status: "pending" },
  { stage: "extract", label: "Extract skills", status: "pending" },
  { stage: "report", label: "Write report", status: "pending" },
];

function describe(stage: Step["stage"], summary: Record<string, unknown>): string {
  switch (stage) {
    case "scout": {
      const added = summary.added as string[];
      return added.length ? `Added ${added.join(", ")}` : `No companies added (${summary.stopReason})`;
    }
    case "ingest":
      return `${summary.entryLevel} entry-level postings, ${summary.new} new`;
    case "extract":
      return `${summary.extracted} extracted`;
    case "report":
      return `Report #${summary.reportId} saved`;
  }
}

const STEP_ICONS: Record<StepStatus, string> = { pending: "○", running: "◐", done: "✓", error: "✕" };

function RunNow() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const running = steps?.some((s) => s.status === "running") ?? false;

  function update(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev && prev.map((step, j) => (j === i ? { ...step, ...patch } : step)));
  }

  async function run() {
    if (!confirm("Run the full pipeline now? It takes about 5 minutes and costs roughly $0.50 in API credits.")) {
      return;
    }
    setSteps(INITIAL_STEPS);
    let runId: number | undefined;

    for (let i = 0; i < INITIAL_STEPS.length; i++) {
      const { stage } = INITIAL_STEPS[i];
      update(i, { status: "running" });

      // Extraction stops itself before the time limit; keep calling until nothing is left.
      let extracted = 0;
      for (let pass = 0; pass < 5; pass++) {
        const result = await runPipelineStage(stage, runId);
        if (!result.ok) {
          update(i, { status: "error", detail: result.error });
          router.refresh();
          return;
        }
        runId = result.runId ?? runId;
        if (stage !== "extract") {
          update(i, { status: "done", detail: describe(stage, result.summary) });
          break;
        }
        extracted += result.summary.extracted as number;
        if (!(result.summary.remaining as number)) {
          update(i, { status: "done", detail: describe(stage, { extracted }) });
          break;
        }
        update(i, { detail: `${extracted} extracted so far…` });
      }
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={running} className={buttonClass}>
          {running ? "Running…" : "Run now"}
        </button>
        {running && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Keep this page open until it finishes.</p>
        )}
      </div>
      {steps && (
        <ol className="space-y-1.5 text-sm" aria-live="polite">
          {steps.map((step) => (
            <li key={step.stage} className="flex gap-2">
              <span
                aria-hidden
                className={`w-4 text-center ${
                  step.status === "done"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : step.status === "error"
                      ? "text-red-600 dark:text-red-400"
                      : step.status === "running"
                        ? "animate-pulse"
                        : "text-neutral-400"
                }`}
              >
                {STEP_ICONS[step.status]}
              </span>
              <span className={step.status === "pending" ? "text-neutral-400" : ""}>{step.label}</span>
              {step.detail && (
                <span
                  className={
                    step.status === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-neutral-500 dark:text-neutral-400"
                  }
                >
                  · {step.detail}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PipelineControls({
  admin,
  passwordConfigured,
  settings,
}: {
  admin: boolean;
  passwordConfigured: boolean;
  settings: PipelineSettings;
}) {
  if (!passwordConfigured) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {scheduleDescription(settings)} Set <code>DASHBOARD_PASSWORD</code> to
        change the schedule or run it from here.
      </p>
    );
  }
  if (!admin) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {scheduleDescription(settings)} Sign in to change the schedule or run it
          now.
        </p>
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium">Schedule</h3>
        <ScheduleForm settings={settings} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Manual run</h3>
        <RunNow />
      </div>
      <form action={logout}>
        <button type="submit" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
