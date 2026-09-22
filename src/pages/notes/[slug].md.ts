import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { site } from "../../data/site";
import { profile } from "../../data/profile";
import { absolute } from "../../markdown/absolute";

export const getStaticPaths = (async () => {
  const notes = await getCollection("notes", ({ data }) => !data.draft);
  return notes.map((note) => ({ params: { slug: note.id }, props: { note } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ note: CollectionEntry<"notes"> }> = ({ props: { note } }) => {
  const { title, summary, published, updated, tags } = note.data;
  const lines = [
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    `- Author: ${profile.name}`,
    `- Published: ${published.toISOString().slice(0, 10)}`,
    ...(updated ? [`- Updated: ${updated.toISOString().slice(0, 10)}`] : []),
    ...(tags.length ? [`- Tags: ${tags.join(", ")}`] : []),
    `- Canonical: ${site.url}/notes/${note.id}`,
    "",
    absolute((note.body ?? "").trim()),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
