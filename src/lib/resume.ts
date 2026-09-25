import Anthropic from "@anthropic-ai/sdk";
import { anthropic, EXTRACTION_MODEL } from "./anthropic";
import { SKILL_NAMING_RULES } from "./extract";
import { canonicalSkill } from "./skills";
import { supabase } from "./supabase";

const CATEGORIES = ["language", "framework", "database", "cloud_devops", "ai_ml", "concept", "tool"] as const;

interface ResumeSkill {
  name: string;
  category: (typeof CATEGORIES)[number];
  evidence: string; // exact text from the resume that shows the skill
}

const SAVE_RESUME_SKILLS_TOOL: Anthropic.Tool = {
  name: "save_resume_skills",
  description: "Save the technical skills a resume demonstrates.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string", enum: [...CATEGORIES] },
            evidence: {
              type: "string",
              description: "A short phrase copied exactly from the resume that shows this skill.",
            },
          },
          required: ["name", "category", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["skills"],
    additionalProperties: false,
  },
};

// Extracts skills literally, in the resume's own words. Mapping them onto the
// postings' names ("REST APIs" -> "API Design") happens afterwards in
// canonicalSkill, not here: showing the model the postings' skill list made it
// borrow skills from that list that the resume never mentions.
export async function extractResumeSkills(resumeText: string): Promise<ResumeSkill[]> {
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 4096,
    system: `You extract the technical skills a software engineer's resume demonstrates. They will be compared against skills extracted from job postings to find gaps.

${SKILL_NAMING_RULES}
- Include every technology in the skills section and in project tech lists.
- Also include skills the experience and projects clearly show (a CI/CD pipeline, caching, authentication, database schema design).
- Include coursework subjects as concepts ("Data Structures & Algorithms", "Operating Systems").
- Include the broad areas the experience clearly shows, named exactly "Frontend Development", "Backend Development", or "Full-Stack Development".
- For each skill, quote the resume text that shows it. Never add a skill you can't quote.`,
    tools: [SAVE_RESUME_SKILLS_TOOL],
    tool_choice: { type: "tool", name: SAVE_RESUME_SKILLS_TOOL.name },
    messages: [{ role: "user", content: `<resume>\n${resumeText}\n</resume>` }],
  });

  if (response.stop_reason === "max_tokens") throw new Error("Response hit max_tokens before the tool call finished");
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error(`No tool call in response (stop_reason: ${response.stop_reason})`);
  return (toolUse.input as { skills: ResumeSkill[] }).skills;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Categories whose skills are named technologies, so the quote must name them too.
const NAMED_CATEGORIES = new Set(["language", "framework", "database", "cloud_devops", "tool"]);

// Splits skills into ones backed by a real quote from the resume and ones that
// aren't. The quote must appear in the resume, and for named technologies it
// must contain the name, so a PostgreSQL quote can't vouch for MongoDB.
export function verifyEvidence(skills: ResumeSkill[], resumeText: string) {
  const text = normalize(resumeText);
  const verified = skills.filter((s) => {
    const evidence = normalize(s.evidence);
    if (!evidence || !text.includes(evidence)) return false;
    return !NAMED_CATEGORIES.has(s.category) || evidence.includes(normalize(s.name));
  });
  const rejected = skills.filter((s) => !verified.includes(s));
  return { verified, rejected };
}

// Replaces resume_skills with the skills extracted from the given resume text.
export async function saveResumeSkills(skills: ResumeSkill[]): Promise<number> {
  const byKey = new Map<string, { skill: string; category: string }>();
  for (const s of skills) {
    const name = canonicalSkill(s.name);
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), { skill: name, category: s.category });
  }

  const { error: deleteError } = await supabase.from("resume_skills").delete().gte("id", 0);
  if (deleteError) throw deleteError;
  const { error } = await supabase.from("resume_skills").insert([...byKey.values()]);
  if (error) throw error;
  return byKey.size;
}
