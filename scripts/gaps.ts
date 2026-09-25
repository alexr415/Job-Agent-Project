// Phase 3: compare in-demand skills against your resume. Run with `npm run gaps`.
import { computeGapAnalysis } from "../src/lib/analysis";
import { skillKey } from "../src/lib/skills";

const pct = (share: number) => `${Math.round(share * 100)}%`;

async function main() {
  const analysis = await computeGapAnalysis();
  const onResume = new Set(analysis.resumeSkills.map(skillKey));

  console.log(`${analysis.totalPostings} open roles asking for 2 or fewer years of experience (duplicate listings of a role across locations count once).\n`);

  console.log("Top 25 skills:");
  console.table(
    analysis.skills.slice(0, 25).map((s) => ({
      skill: s.skill,
      roles: `${s.postings} (${pct(s.share)})`,
      required: s.required,
      "on resume": onResume.has(skillKey(s.skill)) ? "✓" : "",
    })),
  );

  console.log("\nBiggest gaps:");
  for (const s of analysis.gaps.slice(0, 15)) {
    console.log(`  ${s.skill} appears in ${pct(s.share)} of roles (${s.required} require it), not on your resume.`);
  }

  console.log("\nStrongest matches:");
  for (const s of analysis.matches.slice(0, 10)) {
    console.log(`  ${s.skill}: ${pct(s.share)} of roles.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
