export type AtsProvider = "greenhouse" | "lever" | "ashby";

// The one shape every provider adapter returns, so the rest of the pipeline
// never has to know which ATS a posting came from.
export interface NormalizedPosting {
  sourceJobId: string;
  title: string;
  location: string | null;
  url: string | null;
  description: string; // plain text
  postedAt: string | null; // ISO timestamp
}
