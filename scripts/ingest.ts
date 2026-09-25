// Phase 1: pull entry-level SWE postings from every watched company's job board.
// Run with `npm run ingest`. Safe to re-run: postings are deduped by source job ID.
import { runIngestion } from "../src/lib/ingest";

async function main() {
  const { runId, results } = await runIngestion();

  console.table(
    results.map((r) => ({
      company: r.company,
      "open jobs": r.totalJobs,
      "entry-level": r.entryLevel,
      "by title": r.byTitle,
      "by years": r.byYears,
      new: r.new,
      error: r.error ?? "",
    })),
  );
  const entryLevel = results.reduce((sum, r) => sum + r.entryLevel, 0);
  const added = results.reduce((sum, r) => sum + r.new, 0);
  console.log(`Run ${runId}: ${entryLevel} entry-level postings found, ${added} new.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
