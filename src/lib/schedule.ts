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

// Pipeline stages in the order they run each day.
export const PIPELINE_STAGES = ["scout", "ingest", "extract", "report"] as const;
export type Stage = (typeof PIPELINE_STAGES)[number];

// Checking for new postings is nearly free (ingest calls no LLM; extract only
// processes new postings with Haiku), and seeing a role the day it's posted
// matters for applying early. So these run daily unless the schedule is off.
// The scout and the report cost more and follow the chosen frequency.
const ALWAYS_DAILY: readonly Stage[] = ["ingest", "extract"];

// The stages a scheduled (cron) run should do today, in order. Manual runs
// from the dashboard skip this and run every stage.
export function stagesDueToday(settings: PipelineSettings, now = new Date()): Stage[] {
  if (settings.frequency === "off") return [];
  if (settings.frequency === "daily" || now.getUTCDay() === settings.weekly_day) return [...PIPELINE_STAGES];
  return PIPELINE_STAGES.filter((stage) => ALWAYS_DAILY.includes(stage));
}

export function scheduleDescription(settings: Pick<PipelineSettings, "frequency" | "weekly_day">): string {
  switch (settings.frequency) {
    case "off":
      return "Scheduled runs are off. Use Run now to run it manually.";
    case "daily":
      return "Every day: checks for new postings, finds new companies, and writes a report (about $0.50 a day).";
    case "weekly":
      return `Checks for new postings every day (a few cents). Finds new companies and writes a report every ${
        WEEKDAYS[settings.weekly_day]
      } (about $0.50).`;
  }
}
