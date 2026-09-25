// Rough, regex-based filter for entry-level software roles: either the title
// says so ("New Grad", "Engineer I"), or the description asks for 2 or fewer
// years of experience. Phase 2's LLM extraction reads the full description and
// records years_experience, which is the better judgment; this just keeps
// obvious senior and non-SWE roles out of the database.

const MAX_YEARS = 2;

const ENGINEERING = /\b(software|engineer(ing)?|developer|swe|sde|programmer)\b/i;

// Titles that are entry-level no matter what the description says.
const ENTRY_LEVEL_TITLE = [
  /\bnew\s*grad(uate)?s?\b/i,
  /\b(university|college)\s+(grad(uate)?s?|hire)\b/i,
  /\bgraduate\b/i,
  /\bearly[\s-]career\b/i,
  /\bentry[\s-]level\b/i,
  /\bjunior\b/i,
  /\bjr\.?(?=\s|$)/i,
  /\bassociate\s+(software|engineer|developer)/i,
  /\b(engineer|developer|swe|sde)\s*(i|1)\b(?!\s*(i|1|v)\b)/i, // "Engineer I", "SWE 1", not "Engineer II"
  /\b(level|l)\s*1\b/i,
  /\b20(2[6-9])\b.*\b(grad|start)/i, // "2027 New Grad", "2027 start"
];

// Titles that are dropped outright: senior levels, internships, and
// "engineer" roles that aren't software engineering.
const EXCLUDE_TITLE = [
  /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|architect|distinguished|fellow)\b/i,
  /\b(iii|iv|3|4)\b/i,
  /\b(intern|internship|co-?op|apprentice)\b/i,
  /\brecruit(er|ing)\b/i,
  /\b(support|sales|solutions?|customer|field|advocate|relations|devrel)\b/i,
];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Matches "2+ years", "1-3 years", "two or more years", "3 (three) years" and so on,
// when "experience" follows in the same sentence.
const YEARS_OF_EXPERIENCE =
  /\b(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:\(\w+\)\s*)?(?:\+\s*)?(?:or more\s+)?(?:years?|yrs?)(?:'|’)?\b(?=[^.\n]{0,80}\bexperience\b)/i;

// The first years-of-experience figure in the description, or null if none is
// stated. The first one is used, not the smallest: descriptions often read
// "4+ years of experience ... 2+ years with C++", where 4 is the real bar.
export function statedYearsOfExperience(description: string): number | null {
  const match = description.match(YEARS_OF_EXPERIENCE);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return NUMBER_WORDS[word] ?? Number(word);
}

export type EntryLevelReason = "title" | "years";

// Why a posting counts as entry-level, or null if it doesn't.
export function entryLevelReason(posting: { title: string; description: string }): EntryLevelReason | null {
  const { title, description } = posting;
  if (!ENGINEERING.test(title)) return null;
  if (EXCLUDE_TITLE.some((re) => re.test(title))) return null;
  if (ENTRY_LEVEL_TITLE.some((re) => re.test(title))) return "title";

  const years = statedYearsOfExperience(description);
  return years !== null && years <= MAX_YEARS ? "years" : null;
}
