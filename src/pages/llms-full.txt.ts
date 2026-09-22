import { getCollection } from "astro:content";
import { site } from "../data/site";
import { profile } from "../data/profile";
import { work } from "../data/work";
import { links } from "../data/links";
import { absolute } from "../markdown/absolute";

const where =
  profile.locality === "Remote"
    ? `${profile.role}, remote from ${profile.country}`
    : `${profile.role} in ${profile.locality}, ${profile.country}`;

export async function GET() {
  const notes = (await getCollection("notes", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
  );

  const lines = [
    `# ${profile.name}`,
    "",
    `${where}. ${profile.tagline}`,
    "",
    `Source: ${site.url}`,
    "",
    "## About",
    "",
    profile.bio.join("\n\n"),
    "",
    "## Work",
    "",
    ...work.flatMap((item) => {
      const url = item.href ?? item.repo;
      return [
        `### ${item.name}`,
        "",
        item.blurb,
        "",
        `- Year: ${item.year}`,
        `- Status: ${item.status}`,
        `- Stack: ${item.stack.join(", ")}`,
        ...(url ? [`- Link: ${url}`] : []),
        "",
      ];
    }),
    "## Contact",
    "",
    `- Email: ${profile.email}`,
    ...links.map((link) => `- ${link.label}: ${link.href}`),
    "",
    "## Writing",
    "",
    ...(notes.length
      ? notes.flatMap((note) => [
          `### ${note.data.title}`,
          "",
          `Published: ${note.data.published.toISOString().slice(0, 10)}`,
          `URL: ${site.url}/notes/${note.id}`,
          ...(note.data.tags.length ? [`Tags: ${note.data.tags.join(", ")}`] : []),
          "",
          note.data.summary,
          "",
          absolute((note.body ?? "").trim()),
          "",
        ])
      : ["No posts published yet."]),
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
