// Phase 0 smoke test: one Claude call. Run with `npm run hello`.
import { anthropic, EXTRACTION_MODEL } from "../src/lib/anthropic";

async function main() {
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 256,
    messages: [
      { role: "user", content: "In one sentence, what does an entry-level software engineer do?" },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") console.log(block.text);
  }
  console.log(
    `\n[${response.model}] input tokens: ${response.usage.input_tokens}, output tokens: ${response.usage.output_tokens}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
