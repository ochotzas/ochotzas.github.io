// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { satteri } from "@astrojs/markdown-satteri";
import { headingAnchors, externalLinks, callouts, math, scrollableTables } from "./src/markdown/plugins.mjs";
import { site } from "./src/data/site.ts";

export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes("/og/") && !page.includes("/404") && !page.includes("/play"),
      changefreq: "weekly",
      lastmod: new Date(),
      serialize: (item) => ({
        ...item,
        priority: new URL(item.url).pathname === "/" ? 1 : item.url.includes("/notes/") ? 0.7 : 0.8,
      }),
    }),
  ],
  devToolbar: { enabled: false },
  vite: { plugins: process.env.HTTPS ? [basicSsl()] : [] },
  build: { format: "file", inlineStylesheets: "always" },
  markdown: {
    processor: satteri({
      features: {
        definitionList: true,
        directive: true,
        superscript: false,
        math: true,
        headingAttributes: true,
      },
      mdastPlugins: [callouts, math],
      hastPlugins: [headingAnchors, externalLinks, scrollableTables],
    }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      wrap: false,
    },
  },
});
