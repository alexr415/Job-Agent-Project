// Phase 2: extract structured fields from every posting that hasn't been processed yet.
// Run with `npm run extract`, or `npm run extract -- --limit 5` to try a few first.
import { runExtraction } from "../src/lib/extract";

function parseLimit(): number | undefined {
  const i = process.argv.indexOf("--limit");
  if (i === -1) return undefined;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error("--limit needs a positive integer");
  return n;
}

async function main() {
  const result = await runExtraction({ limit: parseLimit() });

  for (const f of result.failures) console.log(`✗ posting ${f.postingId} (${f.title}): ${f.error}`);
  console.log(
    `Extracted ${result.succeeded}/${result.attempted} postings. ` +
      `Tokens: ${result.inputTokens} in, ${result.outputTokens} out. Cost: $${result.costUsd.toFixed(4)}`,
  );
  if (result.failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
