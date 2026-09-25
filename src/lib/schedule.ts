// Schedule options and logic with no server imports, so client components
// (the dashboard's schedule form) can use them. Reading and saving the
// schedule lives in settings.ts, which needs the database.

export const FREQUENCIES = ["daily", "weekly", "off"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface PipelineSettings {
  frequency: Frequency;
  weekly_day: number; // UTC day of week, 0 = Sunday
  updated_at: string;
}

// Whether a scheduled (cron) invocation should run today. Manual runs from
// the dashboard skip this check.
export function scheduledRunDue(settings: PipelineSettings, now = new Date()): { due: boolean; reason: string } {
  if (settings.frequency === "off") return { due: false, reason: "schedule is off" };
  if (settings.frequency === "weekly" && now.getUTCDay() !== settings.weekly_day) {
    return { due: false, reason: `weekly schedule runs on ${WEEKDAYS[settings.weekly_day]}s (UTC)` };
  }
  return { due: true, reason: settings.frequency };
}
