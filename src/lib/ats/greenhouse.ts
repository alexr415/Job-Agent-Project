import { htmlToText } from "./html";
import type { NormalizedPosting } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  absolute_url?: string;
  content?: string; // entity-escaped HTML
  first_published?: string;
  updated_at?: string;
}

export async function fetchGreenhouse(slug: string): Promise<NormalizedPosting[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Greenhouse ${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs: GreenhouseJob[] };

  return data.jobs.map((job) => ({
    sourceJobId: String(job.id),
    title: job.title.trim(),
    location: job.location?.name ?? null,
    url: job.absolute_url ?? null,
    description: htmlToText(job.content ?? ""),
    postedAt: job.first_published ?? job.updated_at ?? null,
  }));
}
