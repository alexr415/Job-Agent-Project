import type { AtsProvider } from "@/lib/ats";

// Starter watchlist. Every slug was checked against its live board API.
// Phase 5's scout agent adds more companies on top of these.
export const SEED_COMPANIES: { name: string; slug: string; ats_provider: AtsProvider }[] = [
  // Greenhouse
  { name: "Stripe", slug: "stripe", ats_provider: "greenhouse" },
  { name: "Airbnb", slug: "airbnb", ats_provider: "greenhouse" },
  { name: "Figma", slug: "figma", ats_provider: "greenhouse" },
  { name: "Discord", slug: "discord", ats_provider: "greenhouse" },
  { name: "Robinhood", slug: "robinhood", ats_provider: "greenhouse" },
  { name: "Coinbase", slug: "coinbase", ats_provider: "greenhouse" },
  { name: "Databricks", slug: "databricks", ats_provider: "greenhouse" },
  { name: "Cloudflare", slug: "cloudflare", ats_provider: "greenhouse" },
  { name: "Datadog", slug: "datadog", ats_provider: "greenhouse" },
  { name: "Reddit", slug: "reddit", ats_provider: "greenhouse" },
  { name: "Affirm", slug: "affirm", ats_provider: "greenhouse" },
  { name: "DoorDash", slug: "doordashusa", ats_provider: "greenhouse" },
  { name: "Roblox", slug: "roblox", ats_provider: "greenhouse" },
  { name: "Samsara", slug: "samsara", ats_provider: "greenhouse" },
  { name: "Scale AI", slug: "scaleai", ats_provider: "greenhouse" },
  // Lever
  { name: "Palantir", slug: "palantir", ats_provider: "lever" },
  { name: "Spotify", slug: "spotify", ats_provider: "lever" },
  { name: "Zoox", slug: "zoox", ats_provider: "lever" },
  // Ashby
  { name: "Ramp", slug: "ramp", ats_provider: "ashby" },
  { name: "Notion", slug: "notion", ats_provider: "ashby" },
  { name: "OpenAI", slug: "openai", ats_provider: "ashby" },
  { name: "Replit", slug: "replit", ats_provider: "ashby" },
  { name: "Supabase", slug: "supabase", ats_provider: "ashby" },
  { name: "Cohere", slug: "cohere", ats_provider: "ashby" },
  { name: "Linear", slug: "linear", ats_provider: "ashby" },
];
