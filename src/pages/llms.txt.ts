import { getCollection } from "astro:content";
import { site } from "../data/site";
import { profile } from "../data/profile";
import { work } from "../data/work";
import { links } from "../data/links";

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
    `> ${where}. ${profile.tagline}`,
    "",
    profile.bio.join("\n\n"),
    "",
    "## Work",
    "",
    ...work.map((item) => {
      const url = item.href ?? item.repo;
      const head = url ? `- [${item.name}](${url})` : `- ${item.name}`;
      return `${head} (${item.year}, ${item.stack.join(", ")}): ${item.blurb}`;
    }),
    "",
    "## Writing",
    "",
    ...(notes.length
      ? notes.map(
          (note) =>
            `- [${note.data.title}](${site.url}/notes/${note.id}.md) (${note.data.published.toISOString().slice(0, 10)}): ${note.data.summary}`,
        )
      : ["- No posts published yet."]),
    "",
    "## Contact",
    "",
    `- Email: ${profile.email}`,
    ...links.map((link) => `- ${link.label}: ${link.href}`),
    "",
    "## Optional",
    "",
    `- [Full text of every page](${site.url}/llms-full.txt)`,
    `- [RSS feed](${site.url}/rss.xml)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
