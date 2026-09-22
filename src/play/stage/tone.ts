export interface Tone {
  ink: string;
  canvas: string;
  lit: string;
  shade: string;
  floor: string;
  floorEdge: string;
  rim: string;
  structure: string;
  structureLit: string;
  shadow: string;
  dark: boolean;
}

type Rgb = [number, number, number];

const parse = (value: string): Rgb => {
  const v = value.trim();
  if (v.startsWith("#")) {
    const hex = v.length === 4 ? v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v.slice(1, 7);
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  const nums = v.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [0, 0, 0];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const css = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const readTone = (c: CanvasRenderingContext2D): Tone => {
  const style = getComputedStyle(c.canvas.isConnected ? c.canvas : document.documentElement);
  const ink = parse(style.getPropertyValue("--ink") || "#000");
  const canvas = parse(style.getPropertyValue("--canvas") || "#fff");
  const dark = lum(canvas) < lum(ink);

  const near = mix(ink, canvas, 0.34);
  const lit = lum(near) > lum(ink) ? near : ink;
  const shade = lum(near) > lum(ink) ? ink : near;

  return {
    ink: css(ink),
    canvas: css(canvas),
    lit: css(lit),
    shade: css(shade),
    floor: css(mix(canvas, ink, dark ? 0.06 : 0.05)),
    floorEdge: css(mix(canvas, ink, dark ? 0.12 : 0.085)),
    rim: css(mix(canvas, ink, 0.3)),
    structure: css(mix(ink, canvas, 0.1)),
    structureLit: css(mix(ink, canvas, 0.42)),
    shadow: dark ? "rgba(0, 0, 0, 0.55)" : "rgba(0, 0, 0, 0.26)",
    dark,
  };
};

export const drop = (c: CanvasRenderingContext2D, tone: Tone, blur: number, dy: number) => {
  c.shadowColor = tone.shadow;
  c.shadowBlur = blur;
  c.shadowOffsetX = blur * 0.18;
  c.shadowOffsetY = dy;
};

export const noDrop = (c: CanvasRenderingContext2D) => {
  c.shadowColor = "transparent";
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
};

export const sphere = (c: CanvasRenderingContext2D, x: number, y: number, r: number, tone: Tone) => {
  const g = c.createRadialGradient(x - r * 0.42, y - r * 0.46, r * 0.06, x, y, r * 1.12);
  g.addColorStop(0, tone.lit);
  g.addColorStop(0.55, tone.ink);
  g.addColorStop(1, tone.shade);
  return g;
};

export const slab = (
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tone: Tone,
) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, tone.structureLit);
  g.addColorStop(0.45, tone.ink);
  g.addColorStop(1, tone.structure);
  return g;
};
