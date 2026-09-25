// Phase 3: extract skills from your resume into resume_skills (replacing what's there).
// Reads private/resume.txt by default, or a path you pass: `npm run resume -- path/to/resume.txt`.
import fs from "fs";
import { extractResumeSkills, saveResumeSkills, verifyEvidence } from "../src/lib/resume";

async function main() {
  const path = process.argv[2] ?? "private/resume.txt";
  const resumeText = fs.readFileSync(path, "utf8");

  const extracted = await extractResumeSkills(resumeText);
  const { verified, rejected } = verifyEvidence(extracted, resumeText);
  const saved = await saveResumeSkills(verified);

  const byCategory = new Map<string, string[]>();
  for (const s of verified) byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s.name]);
  for (const [category, names] of byCategory) console.log(`${category}: ${names.join(", ")}`);
  for (const s of rejected) console.log(`✗ dropped "${s.name}": evidence "${s.evidence}" isn't in the resume`);
  console.log(`\nSaved ${saved} skills to resume_skills.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
