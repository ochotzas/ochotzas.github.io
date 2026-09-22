import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "../data/site";

export async function GET() {
  const notes = await getCollection("notes", ({ data }) => !data.draft);

  return rss({
    title: site.title,
    description: site.description,
    site: site.url,
    items: notes
      .sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf())
      .map((note) => ({
        title: note.data.title,
        description: note.data.summary,
        pubDate: note.data.published,
        link: `/notes/${note.id}`,
        categories: note.data.tags,
      })),
  });
}
