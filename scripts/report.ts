// Phase 4: generate a personalized report from the current gap analysis. Run with `npm run report`.
import { generateReport } from "../src/lib/report";

async function main() {
  const report = await generateReport();
  console.log(report.contentMd);
  console.log(
    `\n---\nSaved report ${report.reportId}. Tokens: ${report.inputTokens} in, ${report.outputTokens} out. ` +
      `Cost: $${report.costUsd.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
