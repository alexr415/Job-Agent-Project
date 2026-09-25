import Anthropic from "@anthropic-ai/sdk";
import { anthropic, EXTRACTION_MODEL } from "./anthropic";
import { supabase } from "./supabase";

// Claude Haiku 4.5 pricing, USD per million tokens.
const INPUT_COST_PER_MTOK = 1;
const OUTPUT_COST_PER_MTOK = 5;

const SENIORITY_SIGNALS = ["new_grad", "entry", "mid", "senior", "unclear"] as const;

export interface Extraction {
  required_skills: string[];
  nice_to_have_skills: string[];
  years_experience: number | null;
  responsibilities: string[];
  tech_stack: string[];
  seniority_signal: (typeof SENIORITY_SIGNALS)[number];
}

// The "tool" Claude is forced to call. Claude never runs anything here: the
// tool's input schema is just a reliable way to get structured JSON back.
// strict: true makes the API guarantee the input matches this schema exactly.
const SAVE_EXTRACTION_TOOL: Anthropic.Tool = {
  name: "save_extraction",
  description: "Save the structured fields extracted from one job posting.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      required_skills: {
        type: "array",
        items: { type: "string" },
        description: "Technical skills the posting says are required (requirements, 'must have', 'what you bring').",
      },
      nice_to_have_skills: {
        type: "array",
        items: { type: "string" },
        description: "Technical skills listed as preferred, a plus, or nice to have.",
      },
      years_experience: {
        type: ["number", "null"],
        description:
          "Minimum years of professional experience required. For a range like '2-5 years' use 2. Use 0 for new-grad roles that ask for none. null if the posting doesn't say.",
      },
      responsibilities: {
        type: "array",
        items: { type: "string" },
        description: "The main responsibilities, as short phrases (at most 8).",
      },
      tech_stack: {
        type: "array",
        items: { type: "string" },
        description: "Every technology the posting mentions the team using, whether or not it's required.",
      },
      seniority_signal: {
        type: "string",
        enum: [...SENIORITY_SIGNALS],
        description:
          "Overall level the posting targets, judged from the title, years required, and scope of responsibilities.",
      },
    },
    required: [
      "required_skills",
      "nice_to_have_skills",
      "years_experience",
      "responsibilities",
      "tech_stack",
      "seniority_signal",
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You extract structured data from software engineering job postings. The results are aggregated across hundreds of postings to find which skills are most in demand, so consistent naming matters more than anything else.

Skill naming:
- Use the canonical name of each technology: "Kubernetes" not "K8s", "Go" not "Golang", "JavaScript" not "JS", "PostgreSQL" not "Postgres", "AWS" not "Amazon Web Services", "Node.js", "React", "C++", "CI/CD".
- Split lists into separate items: "Python/Java/Go" becomes "Python", "Java", "Go".
- Broad technical areas are fine when the posting names them: "Distributed Systems", "Machine Learning", "System Design", "Data Structures & Algorithms".
- Leave out soft skills (communication, teamwork, ownership), degrees, and years of experience; those aren't skills to study.
- Only include what the posting actually says. Don't infer skills it doesn't mention.`;

function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

interface PostingToExtract {
  id: number;
  title: string;
  location: string | null;
  description: string;
  companies: { name: string } | null;
}

export async function extractPosting(
  posting: PostingToExtract,
): Promise<{ extraction: Extraction; inputTokens: number; outputTokens: number }> {
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [SAVE_EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: SAVE_EXTRACTION_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Company: ${posting.companies?.name ?? "Unknown"}
Title: ${posting.title}
Location: ${posting.location ?? "Not listed"}

<job_description>
${posting.description}
</job_description>`,
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Response hit max_tokens before the tool call finished");
  }
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error(`No tool call in response (stop_reason: ${response.stop_reason})`);

  const input = toolUse.input as Extraction;
  return {
    extraction: {
      ...input,
      required_skills: cleanList(input.required_skills),
      nice_to_have_skills: cleanList(input.nice_to_have_skills),
      responsibilities: cleanList(input.responsibilities),
      tech_stack: cleanList(input.tech_stack),
    },
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export interface ExtractionRunResult {
  attempted: number;
  succeeded: number;
  failures: { postingId: number; title: string; error: string }[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const MAX_ATTEMPTS = 3;

// Extracts every posting that doesn't have an extracted_fields row yet, so
// re-running only processes what's new or previously failed.
export async function runExtraction(options: { limit?: number } = {}): Promise<ExtractionRunResult> {
  let query = supabase
    .from("postings")
    .select("id, title, location, description, companies(name), extracted_fields!left(posting_id)")
    .is("extracted_fields", null)
    .order("id");
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  const pending = data as unknown as PostingToExtract[];

  const result: ExtractionRunResult = {
    attempted: pending.length,
    succeeded: 0,
    failures: [],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };

  async function processOne(posting: PostingToExtract) {
    // The SDK already retries rate limits and server errors; this loop also
    // covers responses that came back without a usable tool call.
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { extraction, inputTokens, outputTokens } = await extractPosting(posting);
        result.inputTokens += inputTokens;
        result.outputTokens += outputTokens;

        const { error: insertError } = await supabase
          .from("extracted_fields")
          .upsert({ posting_id: posting.id, ...extraction, model: EXTRACTION_MODEL });
        if (insertError) throw insertError;

        result.succeeded++;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : JSON.stringify(err);
        if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.AuthenticationError) break;
      }
    }
    result.failures.push({ postingId: posting.id, title: posting.title, error: lastError });
  }

  const CONCURRENCY = 5;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map(processOne));
  }

  result.costUsd =
    (result.inputTokens * INPUT_COST_PER_MTOK + result.outputTokens * OUTPUT_COST_PER_MTOK) / 1_000_000;
  return result;
}
