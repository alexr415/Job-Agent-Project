// Runs pipeline stages locally, in order, the same way the cron routes do.
// `npm run pipeline` runs all of them; `npm run pipeline -- ingest extract` runs just those.
import { isStage, runStage, STAGES, type Stage } from "../src/lib/pipeline";

async function main() {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((s) => !isStage(s));
  if (unknown.length) throw new Error(`Unknown stage(s): ${unknown.join(", ")}. Stages: ${STAGES.join(", ")}`);
  const stages = requested.length ? (requested as Stage[]) : [...STAGES];

  for (const stage of stages) {
    const started = Date.now();
    const result = await runStage(stage);
    console.log(`${stage} (run ${result.runId}, ${Math.round((Date.now() - started) / 1000)}s):`, result.summary);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
