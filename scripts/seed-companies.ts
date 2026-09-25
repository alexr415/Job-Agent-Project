// Inserts the starter watchlist. Safe to re-run: existing companies are skipped.
// Run with `npm run seed`.
import { SEED_COMPANIES } from "../src/data/seed-companies";
import { supabase } from "../src/lib/supabase";

async function main() {
  const { data, error } = await supabase
    .from("companies")
    .upsert(SEED_COMPANIES, { onConflict: "ats_provider,slug", ignoreDuplicates: true })
    .select("name");
  if (error) throw error;

  console.log(`Inserted ${data.length} new companies (${SEED_COMPANIES.length - data.length} already existed).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
