import Anthropic from "@anthropic-ai/sdk";

// Cheap model for bulk work (extracting fields from hundreds of postings).
export const EXTRACTION_MODEL = "claude-haiku-4-5";
// Stronger model for reasoning-heavy steps (the report and the scout agent).
export const REASONING_MODEL = "claude-sonnet-5";

// Reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();
