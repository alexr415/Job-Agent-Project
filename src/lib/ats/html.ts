const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

// Converts a job description's HTML to readable plain text, keeping paragraph
// breaks and list bullets so the LLM can still see the structure.
export function htmlToText(html: string): string {
  // Greenhouse escapes its HTML ("&lt;p&gt;"), so decode first if no real tags are present.
  const source = /<[a-z]/i.test(html) ? html : decodeEntities(html);
  const text = source
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
