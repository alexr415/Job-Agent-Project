// Phase 5: let the scout agent find and add new companies. Run with `npm run scout`.
// Run `npm run ingest` afterwards to pull the new companies' postings.
import { runScout } from "../src/lib/scout";

async function main() {
  const result = await runScout();

  if (result.summary) console.log(`${result.summary}\n`);
  for (const c of result.added) console.log(`+ ${c.name} (${c.ats_provider}/${c.slug}): ${c.reason}`);
  console.log(
    `\nAdded ${result.added.length} companies. Checked ${result.boardsChecked} boards, ` +
      `${result.webSearches} web searches, ${result.turns} turns, stopped on: ${result.stopReason}.\n` +
      `Tokens: ${result.inputTokens} in, ${result.outputTokens} out. Cost: $${result.costUsd.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
