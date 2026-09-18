# ochotzas.com

Personal site. Astro 7, TypeScript, no client framework. Static output, deployed to GitHub Pages.

The arcade at `/play` is the one exception: it loads PixiJS for a GPU post-processing pass. Content pages ship no framework.

Apple-style rounded cards on a greyscale canvas. Plus Jakarta Sans. Light and dark themes.

Deployment, DNS and mail setup live in `OPERATIONS.md` and `dns/`, neither of which is published.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on `localhost:4321`, also on your LAN address |
| `npm run dev:https` | Same, over TLS with a self-signed cert (phones need this for WebRTC) |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run check` | Typecheck only |
| `npm run icons` | Regenerate favicon set and manifest |

## Where things live

```
src/data/          Every fact about me. Zod-validated at build time.
  schema.ts        Shapes. Change here first.
  profile.ts       Name, role, bio, availability, email.
  work.ts          Projects.
  links.ts         Socials.
  site.ts          URL, meta description, analytics token.
  stack.ts         Tools. Not rendered; feeds the JSON-LD only.
src/content/notes/ Writing. One .mdx file per note.
src/components/    All .astro. Interactivity is inline <script>, no islands.
src/markdown/      Sätteri plugins: callouts, heading anchors, external links.
src/pages/         Routes. og/ generates social images.
src/styles/        tokens.css (design tokens + .chip), prose.css (note bodies), fonts.css.
src/assets/fonts/  TTFs used only to render OG images and icons.
src/pages/llms*.ts Machine-readable summaries for LLMs, generated from src/data/.
src/play/          The arcade: transport, host, controller, stage/ (shared
                   presentation, skins, Pixi post pass), games/ (one folder each).
scripts/icons.mjs  One-off icon generation.
public/CNAME       The custom domain. GitHub Pages needs this in the build output.
```

Adding a project is one object in `work.ts`. Adding a note is one file in `src/content/notes/`. Neither requires touching a component. Setting `profile.available` to a string shows the status chip under your name; `null` hides it.

## Notes

Frontmatter is validated on build, so a missing `summary` or a malformed `published` date fails the build rather than shipping broken.

```yaml
---
title: "Title"
summary: "One sentence."
published: 2026-01-27
tags: ["python"]
draft: false
---
```

`draft: true` keeps a note out of the build, the RSS feed and the sitemap.

## Arcade

`/play` on a laptop shows a room code and a QR; phones open `/play/pad?room=CODE` and become controllers over WebRTC. No server: signalling rides on Trystero. Append `?local=1` to both URLs to run host and pads as browser tabs on one machine, which is how it is tested. For real phones use `npm run dev:https` — plain http over the LAN is not a secure context, so Safari blocks WebRTC and the wake lock never engages.

The first phone in is the captain and picks the game from its own screen. Room code and scores survive a host reload; **New room** resets them.

Add a game by dropping a `Game` into `src/play/games/` and registering it in `games/index.ts`. It gets the shared countdown, title card, timer, banners, screen shake and particles from `ctx.ui` and `ctx.fx` without drawing any of them itself.
