import { htmlToText } from "./html";
import type { NormalizedPosting } from "./types";

interface LeverJob {
  id: string;
  text: string; // the title
  categories?: { location?: string; allLocations?: string[] };
  hostedUrl?: string;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[]; // "What you'll do", "Who you are", ... as HTML
  additionalPlain?: string;
  createdAt?: number; // epoch ms
}

export async function fetchLever(slug: string): Promise<NormalizedPosting[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Lever ${slug}: HTTP ${res.status}`);
  const jobs = (await res.json()) as LeverJob[];

  return jobs.map((job) => {
    // Lever splits the description into an intro, titled lists, and a closing section.
    const sections = [
      job.descriptionPlain ?? "",
      ...(job.lists ?? []).map((list) => `${list.text}\n${htmlToText(list.content)}`),
      job.additionalPlain ?? "",
    ];
    return {
      sourceJobId: job.id,
      title: job.text.trim(),
      location: job.categories?.allLocations?.join("; ") ?? job.categories?.location ?? null,
      url: job.hostedUrl ?? null,
      description: sections.map((s) => s.trim()).filter(Boolean).join("\n\n"),
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    };
  });
}
