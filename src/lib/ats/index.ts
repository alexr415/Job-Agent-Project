import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import type { AtsProvider, NormalizedPosting } from "./types";

export type { AtsProvider, NormalizedPosting } from "./types";

const ADAPTERS: Record<AtsProvider, (slug: string) => Promise<NormalizedPosting[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

// Fetches every open job on a company's public board, in the normalized shape.
export function fetchPostings(provider: AtsProvider, slug: string): Promise<NormalizedPosting[]> {
  return ADAPTERS[provider](slug);
}
