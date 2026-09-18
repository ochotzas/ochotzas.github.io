import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { openSync } from "fontkit";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const SIZE = 512;
const INK = "#000000";
const PAPER = "#ffffff";
const MARK = "oc";
const FONT_SIZE = 330;
const WEIGHT = 800;

const font = openSync("src/assets/fonts/PlusJakartaSans.ttf").getVariation({ wght: WEIGHT });
const scale = FONT_SIZE / font.unitsPerEm;
const run = font.layout(MARK);

let cursor = 0;
const paths = run.glyphs.map((glyph, i) => {
  const path = glyph.path.scale(scale, -scale).translate(cursor, 0);
  cursor += run.positions[i].xAdvance * scale;
  return path;
});

const boxes = paths.map((path) => path.bbox);
const minX = Math.min(...boxes.map((b) => b.minX));
const maxX = Math.max(...boxes.map((b) => b.maxX));
const minY = Math.min(...boxes.map((b) => b.minY));
const maxY = Math.max(...boxes.map((b) => b.maxY));

const dx = (SIZE - (maxX - minX)) / 2 - minX;
const dy = (SIZE - (maxY - minY)) / 2 - minY;
const d = paths.map((path) => path.toSVG()).join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect width="${SIZE}" height="${SIZE}" rx="115" fill="${INK}"/>
<path transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})" d="${d}" fill="${PAPER}"/>
</svg>`;

await mkdir("public", { recursive: true });
await writeFile("public/icon.svg", svg);

const buffer = Buffer.from(svg);
const render = (size) => sharp(buffer, { density: 384 }).resize(size, size).png();

await render(180).toFile("public/apple-touch-icon.png");
await render(192).toFile("public/icon-192.png");
await render(512).toFile("public/icon-512.png");

const ico = await Promise.all([16, 32, 48].map((s) => render(s).toBuffer()));
await writeFile("public/favicon.ico", await pngToIco(ico));

await writeFile(
  "public/manifest.webmanifest",
  JSON.stringify(
    {
      name: "Olger Chotza",
      short_name: "Olger Chotza",
      start_url: "/",
      display: "minimal-ui",
      background_color: INK,
      theme_color: INK,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  ),
);

console.log("icons written");
