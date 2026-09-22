import { stackSchema } from "./schema";

export const stack = stackSchema.parse([
  {
    group: "Run AI on",
    items: ["Ollama", "vLLM", "LiteLLM", "LLM APIs", "MCP", "LangGraph", "Pydantic AI", "Langfuse", "MLflow"],
  },
  { group: "Pair with", items: ["Claude Code", "Codex", "Antigravity"] },
  { group: "Think in", items: ["Python", "TypeScript", "C#", "Java", "C/C++"] },
  {
    group: "Build with",
    items: [
      "FastAPI",
      "Django",
      "Flask",
      "Next.js",
      "React",
      "Astro",
      "Node.js",
      "Tailwind",
      "shadcn/ui",
      "PyQt6",
      "Tkinter",
    ],
  },
  {
    group: "Store in",
    items: [
      "PostgreSQL",
      "pgvector",
      "Redis",
      "SQLite",
      "MySQL",
      "MongoDB",
      "Firebase",
      "SQLAlchemy",
      "Prisma",
      "Drizzle",
    ],
  },
  { group: "Ship on", items: ["Docker", "Docker Compose", "GitLab CI", "GitHub Actions", "Nginx", "Linux"] },
  { group: "Test with", items: ["pytest", "Robot Framework", "Selenium", "NUnit", "JUnit", "Moq"] },
  { group: "Reach for", items: ["uv", "Ruff", "Polars", "NumPy", "Git", "Postman", "Jira", "Bun", "Biome"] },
]);
