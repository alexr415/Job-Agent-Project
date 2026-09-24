// Phase 0 smoke test: confirm every table exists and print row counts. Run with `npm run check-db`.
import { supabase } from "../src/lib/supabase";

const TABLES = ["companies", "runs", "postings", "extracted_fields", "resume_skills", "reports"];

async function main() {
  let failed = false;
  for (const table of TABLES) {
    const { count, error, status } = await supabase.from(table).select("*", { count: "exact", head: true });
    // A null count with no error means the request didn't reach PostgREST properly (e.g. a bad SUPABASE_URL path).
    if (error || count === null) {
      failed = true;
      // head: true requests get no response body, so the message is often empty; the status tells you why.
      console.log(`✗ ${table}: HTTP ${status} ${error?.message || error?.code || "no count returned"}`);
    } else {
      console.log(`✓ ${table}: ${count} rows`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
