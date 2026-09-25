import { daysSincePosted, FRESH_DAYS, postedLabel, WEEK_DAYS, type Dated } from "@/lib/freshness";

// The role's age, styled by urgency: just posted stands out, this week is
// visible, anything older recedes.
export function PostedBadge({ job, now }: { job: Dated; now: number }) {
  const days = daysSincePosted(job, now);
  const style =
    days <= FRESH_DAYS
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : days <= WEEK_DAYS
        ? "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
        : "text-neutral-500 dark:text-neutral-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      {postedLabel(job, now)}
    </span>
  );
}
