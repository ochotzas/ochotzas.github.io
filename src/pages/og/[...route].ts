import { OGImageRoute } from "astro-og-canvas";
import { getCollection } from "astro:content";
import { profile } from "../../data/profile";
import { site } from "../../data/site";

const notes = await getCollection("notes", ({ data }) => !data.draft);

const pages: Record<string, { title: string; description: string }> = {
  home: { title: profile.name, description: profile.tagline },
  notes: { title: "Stuff I Wrote", description: site.description },
  contact: { title: "Say Hello", description: `Email ${profile.email}, or find me on GitHub and LinkedIn.` },
};

for (const note of notes) {
  pages[`notes/${note.id}`] = {
    title: note.data.title,
    description: note.data.summary,
  };
}

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    logo: { path: "./public/icon-512.png", size: [76] },
    bgGradient: [[0, 0, 0]],
    padding: 90,
    border: { color: [255, 255, 255], width: 10, side: "block-end" },
    font: {
      title: {
        color: [255, 255, 255],
        size: 82,
        weight: "ExtraBold",
        lineHeight: 1.05,
        families: ["Plus Jakarta Sans"],
      },
      description: {
        color: [150, 150, 150],
        size: 28,
        lineHeight: 1.45,
        families: ["Plus Jakarta Sans"],
      },
    },
    fonts: ["./src/assets/fonts/PlusJakartaSans.ttf"],
  }),
});
