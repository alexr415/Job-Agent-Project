// Turns the skill names Claude extracts into one canonical name per skill, so
// "Golang", "golang" and "Go" count as the same thing when comparing postings
// against the resume. Built from the names that actually show up in the data;
// add to it as new variants appear in `npm run gaps` output.

// Variants (lowercase) -> canonical name.
const ALIASES: Record<string, string> = {
  // Languages
  golang: "Go",
  "c/c++": "C++",
  js: "JavaScript",
  ts: "TypeScript",
  // Fundamentals
  "data structures": "Data Structures & Algorithms",
  algorithms: "Data Structures & Algorithms",
  "data structures and algorithms": "Data Structures & Algorithms",
  dsa: "Data Structures & Algorithms",
  "object oriented programming": "Object-Oriented Programming",
  oop: "Object-Oriented Programming",
  // Frontend / backend / full stack
  frontend: "Frontend Development",
  "front-end development": "Frontend Development",
  "frontend engineering": "Frontend Development",
  "frontend software engineering": "Frontend Development",
  "web development": "Frontend Development",
  "front-end frameworks": "Frontend Development",
  "frontend frameworks": "Frontend Development",
  backend: "Backend Development",
  "backend engineering": "Backend Development",
  "backend software development": "Backend Development",
  "backend systems": "Backend Development",
  "backend services": "Backend Development",
  "backend infrastructure": "Backend Development",
  "full stack development": "Full-Stack Development",
  "full-stack software engineering": "Full-Stack Development",
  "reactjs": "React",
  "react.js": "React",
  node: "Node.js",
  nodejs: "Node.js",
  // APIs
  api: "API Design",
  apis: "API Design",
  "api development": "API Design",
  "rest api design": "API Design",
  "rest apis": "API Design",
  "restful apis": "API Design",
  "restful api design": "API Design",
  rest: "API Design",
  "web apis": "API Design",
  "public apis": "API Design",
  "backend apis": "API Design",
  "api integrations": "API Integration",
  "external api integration": "API Integration",
  // Cloud and infrastructure
  "amazon web services": "AWS",
  "aws s3": "AWS",
  s3: "AWS",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  "microsoft azure": "Azure",
  k8s: "Kubernetes",
  cloud: "Cloud Infrastructure",
  "cloud services": "Cloud Infrastructure",
  "cloud platforms": "Cloud Infrastructure",
  "cloud-native architectures": "Cloud Infrastructure",
  "ci/cd pipelines": "CI/CD",
  microservices: "Microservices",
  "microservices architecture": "Microservices",
  "service-oriented architecture": "Microservices",
  "service-oriented architectures": "Microservices",
  monitoring: "Observability",
  "monitoring and alerting": "Observability",
  "observability tools": "Observability",
  "observability tooling": "Observability",
  "observability/monitoring": "Observability",
  "systems monitoring": "Observability",
  // Data
  postgres: "PostgreSQL",
  "apache spark": "Spark",
  "apache kafka": "Kafka",
  "apache flink": "Flink",
  "apache airflow": "Airflow",
  "sql databases": "SQL",
  "relational databases": "SQL",
  "nosql databases": "NoSQL",
  // AI
  llm: "LLMs",
  "large language models": "LLMs",
  "ai/llms": "LLMs",
  "llm integration": "LLMs",
  ai: "LLMs",
  "generative ai": "LLMs",
  "ai/ml": "Machine Learning",
  "ai/machine learning": "Machine Learning",
  ml: "Machine Learning",
  "retrieval-augmented generation": "RAG",
  "agentic systems": "AI Agents",
  "agentic ai": "AI Agents",
  "agentic ai systems": "AI Agents",
  "agentic workflows": "AI Agents",
  "llm agents": "AI Agents",
  "ai tools": "AI Coding Tools",
  "ai tooling": "AI Coding Tools",
  "ai development tools": "AI Coding Tools",
  "ai developer tooling": "AI Coding Tools",
  "ai-powered developer tools": "AI Coding Tools",
  "ai-powered tools": "AI Coding Tools",
  "claude code": "AI Coding Tools",
  cursor: "AI Coding Tools",
  "database schema design": "Data Modeling",
  "database design": "Data Modeling",
  "computer networks": "Networking",
  "jwt authentication": "Authentication",
  "user authentication": "Authentication",
  // Tools and practices
  github: "Git",
  "version control": "Git",
  "code review practices": "Code Review",
  "unit testing": "Testing",
  "automated testing": "Testing",
  "test-driven development": "Testing",
  android: "Android Development",
};

// Too generic to study for or to count as a gap.
const IGNORED = new Set([
  "software engineering",
  "software engineering fundamentals",
  "software development",
  "programming",
  "programming fundamentals",
  "programming languages",
  "strong coding skills",
  "strong coding skills in any programming language",
  "problem-solving",
  "problem solving",
  "cross-functional collaboration",
  "production-grade code",
  "large codebases",
  "large codebase navigation",
  "large codebase management",
  "design",
  "web technologies",
]);

// Canonical name for a skill, or null if it's too generic to count.
export function canonicalSkill(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key || IGNORED.has(key)) return null;
  return ALIASES[key] ?? raw.trim();
}

// Canonicalizes a list and merges names that differ only by case
// ("Frontend development" / "Frontend Development"), keeping the first spelling seen.
export function canonicalSkills(raw: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of raw) {
    const skill = canonicalSkill(item);
    if (skill && !byKey.has(skill.toLowerCase())) byKey.set(skill.toLowerCase(), skill);
  }
  return [...byKey.values()];
}

// Key for comparing two skill names regardless of case.
export function skillKey(skill: string): string {
  return skill.toLowerCase();
}
