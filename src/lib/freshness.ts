// How recently a role was posted, which matters most for applying early.
// No server imports, so client components can use it. Callers pass `now`
// from the server so server and browser render the same labels.

export const FRESH_DAYS = 3; // "just posted": worth applying today
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// The current time for a server-rendered page. Pages call this once, after
// connection() has made them per-request, and pass the value down, so every
// "N days ago" on the page (and its hydration in the browser) agrees.
export function requestTime(): number {
  return Date.now();
}

export interface Dated {
  postedAt: string | null; // from the job board; missing for some postings
  firstSeenAt: string; // when the pipeline first found it
}

// The best available date for when a role went up.
export function postedDate(job: Dated): string {
  return job.postedAt ?? job.firstSeenAt;
}

export function daysSincePosted(job: Dated, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(postedDate(job))) / DAY_MS));
}

export function postedLabel(job: Dated, now: number): string {
  const days = daysSincePosted(job, now);
  const verb = job.postedAt ? "Posted" : "Found";
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  if (days <= MONTH_DAYS) return `${verb} ${days} days ago`;
  const date = new Date(postedDate(job)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${verb} ${date}`;
}
