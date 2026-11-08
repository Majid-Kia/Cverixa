/**
 * A small vocabulary of common technical terms. Used by the deterministic
 * evidence matcher as a tokenization aid and by the mock AI provider. It is
 * not an exhaustive taxonomy and never decides whether a skill is "required".
 */
export const TECH_KEYWORDS: string[] = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "node.js",
  "nodejs",
  "node",
  "vue",
  "angular",
  "svelte",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "kotlin",
  "scala",
  "go",
  "golang",
  "rust",
  "c#",
  ".net",
  "c++",
  "ruby",
  "rails",
  "php",
  "laravel",
  "swift",
  "objective-c",
  "sql",
  "postgresql",
  "postgres",
  "mysql",
  "sqlite",
  "mongodb",
  "redis",
  "elasticsearch",
  "kafka",
  "rabbitmq",
  "graphql",
  "rest",
  "grpc",
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "ansible",
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "linux",
  "ci/cd",
  "github actions",
  "jenkins",
  "gitlab",
  "playwright",
  "cypress",
  "jest",
  "vitest",
  "tailwind",
  "css",
  "html",
  "sass",
  "webpack",
  "vite",
  "prisma",
  "microservices",
  "serverless",
  "machine learning",
  "data engineering",
  "spark",
  "airflow",
  "pandas",
  "tensorflow",
  "pytorch",
  "agile",
  "scrum",
  "architecture",
  "leadership",
  "mentoring",
];

/** Lower-case, collapse whitespace, strip most punctuation while keeping tech tokens like c# and .net. */
export function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9#+.\-/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether `term` appears in `text` as a whole word/phrase (case-insensitive). */
export function containsTerm(text: string, term: string): boolean {
  const haystack = ` ${normalizeTerm(text)} `;
  const needle = normalizeTerm(term);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9+#])`, "i").test(haystack);
}

/** Technical keywords found in a text, in order of first appearance. */
export function findTechKeywords(text: string): string[] {
  const found: Array<{ term: string; index: number }> = [];
  const normalized = normalizeTerm(text);
  for (const term of TECH_KEYWORDS) {
    if (containsTerm(normalized, term)) {
      found.push({ term, index: normalized.indexOf(term) });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((item) => item.term);
}
