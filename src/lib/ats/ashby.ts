import { htmlToText } from "./html";
import type { NormalizedPosting } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  jobUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  isListed?: boolean;
}

export async function fetchAshby(slug: string): Promise<NormalizedPosting[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ashby ${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs: AshbyJob[] };

  return data.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => ({
      sourceJobId: job.id,
      title: job.title.trim(),
      location:
        [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join("; ") ||
        null,
      url: job.jobUrl ?? null,
      description: job.descriptionPlain?.trim() || htmlToText(job.descriptionHtml ?? ""),
      postedAt: job.publishedAt ?? null,
    }));
}
