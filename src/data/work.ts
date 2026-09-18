import { workSchema } from "./schema";

export const work = workSchema.parse([
  {
    name: "PromptKit",
    blurb:
      "A prompt is a dependency. This gives it the tooling of one: YAML with typed inputs, a linter that finds the typo before your invoice does, eval suites that fail a build, and a price for the run before you press go. On PyPI as promptkit-core.",
    stack: ["Python", "Pydantic", "Jinja2", "Typer"],
    year: 2025,
    status: "active",
    href: "https://promptkit-core.ochotzas.com/",
    repo: "https://github.com/ochotzas/promptkit-core",
  },
]);
