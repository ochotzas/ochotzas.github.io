import { drop, noDrop, readTone, slab, sphere, type Tone } from "../../stage/tone";
import type { Cell } from "./physics";

export interface View {
  size: number;
  ox: number;
  oy: number;
}

export const fitView = (width: number, height: number, cols: number, rows: number): View => {
  const size = Math.min((width * 0.92) / cols, (height * 0.82) / rows);
  return { size, ox: (width - cols * size) / 2, oy: (height - rows * size) / 2 };
};

const wave = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  element: 1 | 2,
  tone: Tone,
) => {
  c.save();
  c.beginPath();
  c.rect(x, y, s, s);
  c.clip();

  c.fillStyle = tone.floorEdge;
  c.fillRect(x, y, s, s);

  c.strokeStyle = tone.rim;
  c.lineWidth = Math.max(1, s * 0.055);

  if (element === 1) {
    for (let i = -1; i < 4; i += 1) {
      const oy = y + (i * s) / 3 + ((t * s * 0.22) % (s / 3));
      c.beginPath();
      for (let k = 0; k <= 6; k += 1) {
        const px = x + (k / 6) * s;
        const py = oy + Math.sin(k * 1.1 + t * 2.4) * s * 0.05;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
  } else {
    c.fillStyle = tone.rim;
    for (let gy = 0; gy < 3; gy += 1)
      for (let gx = 0; gx < 3; gx += 1) {
        const px = x + (gx + 0.5) * (s / 3);
        const py = y + (gy + 0.5) * (s / 3) + Math.sin(t * 2.2 + gx * 0.9) * s * 0.03;
        const r = s * 0.075 * (1 + Math.sin(t * 3 + gx + gy) * 0.25);
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
      }
  }
  c.restore();
};

export const drawLevel = (
  c: CanvasRenderingContext2D,
  grid: Cell[][],
  view: View,
  openGates: boolean[],
  plateHeat: number[],
  t: number,
) => {
  const tone = readTone(c);
  const { size: s, ox, oy } = view;

  const back = c.createRadialGradient(
    ox + (grid[0].length * s) / 2,
    oy + grid.length * s * 0.35,
    s,
    ox + (grid[0].length * s) / 2,
    oy + (grid.length * s) / 2,
    grid[0].length * s * 0.7,
  );
  back.addColorStop(0, tone.canvas);
  back.addColorStop(0.7, tone.floor);
  back.addColorStop(1, tone.floorEdge);
  c.fillStyle = back;
  c.fillRect(ox - s, oy - s, grid[0].length * s + s * 2, grid.length * s + s * 2);

  const wall = c.createLinearGradient(ox, oy, ox + grid[0].length * s * 0.45, oy + grid.length * s);
  wall.addColorStop(0, tone.structure);
  wall.addColorStop(0.5, tone.ink);
  wall.addColorStop(1, tone.structure);

  for (let r = 0; r < grid.length; r += 1)
    for (let q = 0; q < grid[r].length; q += 1) {
      const cell = grid[r][q];
      const x = ox + q * s;
      const y = oy + r * s;

      if (cell.pool) {
        wave(c, x, y, s, t, cell.pool, tone);
        continue;
      }

      if (cell.hazard) {
        c.save();
        c.beginPath();
        c.rect(x, y, s, s);
        c.clip();
        c.fillStyle = tone.floorEdge;
        c.fillRect(x, y, s, s);
        c.strokeStyle = tone.ink;
        c.lineWidth = Math.max(1, s * 0.07);
        for (let i = -3; i < 4; i += 1) {
          c.beginPath();
          c.moveTo(x + (i * s) / 3, y);
          c.lineTo(x + (i * s) / 3 + s, y + s);
          c.stroke();
        }
        c.restore();
        continue;
      }

      if (cell.gate >= 0) {
        const open = openGates[cell.gate];
        c.save();
        c.globalAlpha = open ? 0.16 : 1;
        c.fillStyle = open ? tone.rim : slab(c, x, y, x + s, y + s, tone);
        c.fillRect(x + s * 0.06, y, s * 0.88, s);
        if (!open) {
          c.strokeStyle = tone.structureLit;
          c.lineWidth = Math.max(1, s * 0.05);
          for (let i = 1; i < 3; i += 1) {
            c.beginPath();
            c.moveTo(x + s * 0.06, y + (i * s) / 3);
            c.lineTo(x + s * 0.94, y + (i * s) / 3);
            c.stroke();
          }
        }
        c.restore();
        continue;
      }

      if (cell.ledge) {
        c.save();
        drop(c, tone, s * 0.22, s * 0.08);
        c.fillStyle = wall;
        c.fillRect(x, y, s, s * 0.22);
        c.fillStyle = tone.structureLit;
        c.fillRect(x, y, s, Math.max(1, s * 0.05));
        c.restore();
        noDrop(c);
        continue;
      }

      if (cell.solid) {
        c.fillStyle = wall;
        c.fillRect(x, y, s + 0.5, s + 0.5);
        const exposed = r === 0 || !grid[r - 1][q].solid;
        if (exposed) {
          c.fillStyle = tone.structureLit;
          c.fillRect(x, y, s + 0.5, Math.max(1, s * 0.1));
          c.fillStyle = tone.rim;
          c.globalAlpha = 0.25;
          c.fillRect(x, y + Math.max(1, s * 0.1), s + 0.5, Math.max(1, s * 0.06));
          c.globalAlpha = 1;
        }
      }
    }

  void plateHeat;
};

export const drawPlate = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  pressed: number,
) => {
  const tone = readTone(c);
  const dy = pressed * s * 0.1;
  c.save();
  drop(c, tone, s * 0.2, s * 0.06 + dy * 0.4);
  c.fillStyle = pressed > 0.5 ? tone.structureLit : slab(c, x, y, x + s, y + s * 0.4, tone);
  c.beginPath();
  c.roundRect(x + s * 0.1, y - s * 0.18 + dy, s * 0.8, s * 0.2, s * 0.07);
  c.fill();
  c.restore();
  noDrop(c);
};

export const drawExit = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  element: 1 | 2,
  home: boolean,
  t: number,
) => {
  const tone = readTone(c);
  c.save();
  c.globalAlpha = home ? 1 : 0.75;
  c.strokeStyle = home ? tone.ink : tone.rim;
  c.lineWidth = Math.max(2, s * 0.09);
  c.beginPath();
  c.moveTo(x + s * 0.08, y + s);
  c.lineTo(x + s * 0.08, y + s * 0.42);
  c.arc(x + s * 0.5, y + s * 0.42, s * 0.42, Math.PI, 0);
  c.lineTo(x + s * 0.92, y + s);
  c.stroke();

  const pulse = home ? 1 : 0.45 + Math.sin(t * 3) * 0.2;
  c.globalAlpha = pulse;
  c.fillStyle = tone.ink;
  if (element === 1) {
    c.beginPath();
    c.arc(x + s * 0.5, y + s * 0.5, s * 0.15, 0, Math.PI * 2);
    c.fill();
  } else {
    c.lineWidth = Math.max(2, s * 0.08);
    c.strokeStyle = tone.ink;
    c.beginPath();
    c.arc(x + s * 0.5, y + s * 0.5, s * 0.16, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
};

export const drawBody = (
  c: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  h: number,
  element: 1 | 2,
  facing: number,
  ghost: number,
) => {
  const tone = readTone(c);
  c.save();
  c.globalAlpha = 1 - ghost;
  drop(c, tone, h * 0.35, h * 0.16);
  c.fillStyle = sphere(c, px, py - h * 0.5, h * 0.6, tone);
  c.beginPath();
  c.roundRect(px - w / 2, py - h, w, h, w * 0.42);
  c.fill();
  noDrop(c);

  c.fillStyle = tone.canvas;
  if (element === 1) {
    c.beginPath();
    c.arc(px, py - h * 0.62, w * 0.21, 0, Math.PI * 2);
    c.fill();
  } else {
    c.lineWidth = Math.max(1.5, w * 0.14);
    c.strokeStyle = tone.canvas;
    c.beginPath();
    c.arc(px, py - h * 0.62, w * 0.22, 0, Math.PI * 2);
    c.stroke();
  }

  c.fillStyle = tone.canvas;
  c.beginPath();
  c.arc(px + facing * w * 0.16, py - h * 0.86, w * 0.08, 0, Math.PI * 2);
  c.fill();
  c.restore();
};
