import type { Metadata } from "next";
import { connection } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requestTime } from "@/lib/freshness";
import { getOpenJobs } from "@/lib/jobs";
import { JobsList } from "./jobs-list";

export const metadata: Metadata = { title: "Open roles · SWE Job Market Agent" };

export default async function JobsPage() {
  // Render on every request: the list changes with every pipeline run.
  await connection();
  const now = requestTime();
  const result = await getOpenJobs().then(
    (r) => ({ ...r, error: null }),
    (err: unknown) => ({ jobs: null, latestRunAt: null, error: errorMessage(err) }),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Open roles</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Entry-level software roles (new grad, or 2 or fewer years of experience) that were open as of the last run
          {result.latestRunAt &&
            ` on ${new Date(result.latestRunAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
          , newest postings first: applying in the first few days gives you the best shot. Links go straight to each
          company&apos;s application page.
        </p>
      </header>
      {result.jobs ? (
        <JobsList jobs={result.jobs} now={now} />
      ) : (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load roles: {result.error}</p>
      )}
    </main>
  );
}
