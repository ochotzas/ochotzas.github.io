import type { ControlKey } from "../../protocol";
import { mark, SKIN_COUNT } from "../../stage/skins";
import { drop, noDrop, readTone, sphere } from "../../stage/tone";
import { ink, type Game, type GameContext } from "../types";

interface Rider {
  id: string;
  name: string;
  skin: number;
  x: number;
  y: number;
  angle: number;
  turn: number;
  alive: boolean;
  falling: number;
  rank: number;
  run: number;
  gap: number;
  nextGap: number;
  queue: { x: number; y: number; hole: boolean; at: number }[];
  tail: { x: number; y: number } | null;
}

const ROUND = 90;
const TURN_RATE = 2.5;
const SUBSTEP = 1.6;

let ctx: GameContext | null = null;
let riders: Rider[] = [];
let board: HTMLCanvasElement | null = null;
let paint: CanvasRenderingContext2D | null = null;
let marks: HTMLCanvasElement | null = null;
let etch: CanvasRenderingContext2D | null = null;
let grid = new Uint8Array(0);
let cols = 0;
let rows = 0;
let cell = 0;
let width = 0;
let height = 0;
let margin = 0;
let speed = 0;
let thickness = 0;
let scale = 0;
let elapsed = 0;
let over = false;
let gone = 0;
let lastTimer = -1;
let carry = 0;
let inkColour = "";
let plateColour = "";

const alive = () => riders.filter((r) => r.alive);

const occupied = (x: number, y: number) => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return true;
  return grid[gy * cols + gx] === 1;
};

const stamp = (x: number, y: number) => {
  const r = thickness * 0.5;
  const x0 = Math.max(0, Math.floor((x - r) / cell));
  const x1 = Math.min(cols - 1, Math.floor((x + r) / cell));
  const y0 = Math.max(0, Math.floor((y - r) / cell));
  const y1 = Math.min(rows - 1, Math.floor((y + r) / cell));
  for (let gy = y0; gy <= y1; gy += 1)
    for (let gx = x0; gx <= x1; gx += 1) grid[gy * cols + gx] = 1;
};

const styleLine = (c: CanvasRenderingContext2D, skin: number) => {
  const style = skin % 5;
  if (style === 1) c.setLineDash([thickness * 0.22, thickness * 0.5]);
  else if (style === 2) c.setLineDash([thickness * 0.9, thickness * 0.7]);
  else if (style === 3) c.setLineDash([thickness * 2.4, thickness * 0.5]);
  else if (style === 4) c.setLineDash([thickness * 0.22, thickness * 0.4, thickness * 1.1, thickness * 0.4]);
  else c.setLineDash([]);
};

const settle = () => {
  if (over || !ctx) return;
  const left = alive();
  if (left.length > 1 && elapsed < ROUND) return;

  over = true;
  left.forEach((r) => {
    r.rank = riders.length;
  });

  const points: Record<string, number> = {};
  riders.forEach((r) => {
    points[r.id] = Math.max(0, r.rank - 1) * 5 + (r.alive ? 15 : 0);
  });

  const champion = left[0];
  const summary = !champion
    ? "Everybody crashed at once"
    : left.length === 1
      ? `${champion.name} was the only one left moving`
      : `Time — ${left.length} still running`;

  ctx.ui.timer(null);
  ctx.ui.note(null);
  ctx.finish(points, summary);
};

const crash = (r: Rider) => {
  if (!r.alive || !ctx) return;
  r.alive = false;
  r.falling = 0.001;
  gone += 1;
  r.rank = gone;

  ctx.fx.burst(r.x, r.y, { count: 20, speed: scale * 1.9, size: scale * 0.004, life: 0.5 });
  ctx.fx.ring(r.x, r.y, thickness, thickness * 5, 0.45);
  ctx.fx.shake(scale * 0.035, 0.35);
  ctx.buzz(r.id, 240);

  const left = alive();
  if (left.length === 1) ctx.ui.banner(`${left[0].name} takes it`, 2200);
  else if (left.length === 0) ctx.ui.banner(`${r.name} crashed — nobody left`, 2200);
  else ctx.ui.banner(`${r.name} crashed · ${left.length} still running`, 1500);
};

const advance = (r: Rider, step: number) => {
  r.angle += r.turn * TURN_RATE * (step / speed);
  r.x += Math.cos(r.angle) * step;
  r.y += Math.sin(r.angle) * step;
  r.run += step;

  const probe = thickness * 0.5 + 1;
  const px = r.x + Math.cos(r.angle) * probe;
  const py = r.y + Math.sin(r.angle) * probe;

  if (px < margin || py < margin || px > width - margin || py > height - margin) {
    crash(r);
    return;
  }
  if (occupied(px, py)) {
    crash(r);
    return;
  }

  if (r.gap > 0) r.gap -= step;
  else if (r.run > r.nextGap) {
    r.gap = thickness * 3.4;
    r.nextGap = r.run + scale * (0.5 + Math.random() * 0.7);
  }

  r.queue.push({ x: r.x, y: r.y, hole: r.gap > 0, at: r.run });

  const lag = Math.ceil((thickness * 2) / SUBSTEP);
  while (r.queue.length > lag) {
    const point = r.queue.shift()!;
    if (point.hole) {
      r.tail = null;
      continue;
    }
    stamp(point.x, point.y);
    if (paint && r.tail) {
      paint.strokeStyle = inkColour;
      paint.lineWidth = thickness;
      paint.lineCap = "round";
      paint.lineJoin = "round";
      paint.setLineDash([]);
      paint.beginPath();
      paint.moveTo(r.tail.x, r.tail.y);
      paint.lineTo(point.x, point.y);
      paint.stroke();

      if (etch && r.skin % 5 !== 0) {
        etch.strokeStyle = plateColour;
        etch.lineWidth = thickness * (r.skin >= 5 ? 0.44 : 0.26);
        etch.lineCap = "butt";
        styleLine(etch, r.skin);
        etch.lineDashOffset = -point.at;
        etch.beginPath();
        etch.moveTo(r.tail.x, r.tail.y);
        etch.lineTo(point.x, point.y);
        etch.stroke();
        etch.setLineDash([]);
      }
    }
    r.tail = point;
  }
};

export const trail: Game = {
  id: "trail",
  name: "Trailing Whitespace",
  blurb: "Everyone drives, nobody stops, and the line behind you is a wall. Two buttons. Do not touch anything.",
  min: 2,
  max: 10,
  layout: {
    dpad: false,
    buttons: [
      { key: "left", label: "◀" },
      { key: "right", label: "▶" },
    ],
    hint: "Hold to turn, let go to run straight. Your own trail counts.",
  },

  start(next) {
    ctx = next;
    width = next.width;
    height = next.height;
    scale = Math.min(width, height);
    margin = scale * 0.02;
    thickness = Math.max(6, scale * 0.011);
    speed = scale * 0.17;
    cell = Math.max(2, thickness * 0.4);
    cols = Math.ceil(width / cell);
    rows = Math.ceil(height / cell);
    grid = new Uint8Array(cols * rows);
    elapsed = 0;
    over = false;
    gone = 0;
    lastTimer = -1;
    carry = 0;

    inkColour = "";
    plateColour = "";
    board = document.createElement("canvas");
    board.width = width;
    board.height = height;
    paint = board.getContext("2d");
    marks = document.createElement("canvas");
    marks.width = width;
    marks.height = height;
    etch = marks.getContext("2d");

    const spread = Math.min(width, height) * 0.32;
    riders = next.players.map((p, i) => {
      const a = (i / next.players.length) * Math.PI * 2;
      return {
        id: p.id,
        name: p.name,
        skin: i % SKIN_COUNT,
        x: width / 2 + Math.cos(a) * spread,
        y: height / 2 + Math.sin(a) * spread * 0.8,
        angle: a + Math.PI + (Math.random() - 0.5),
        turn: 0,
        alive: true,
        falling: 0,
        rank: 0,
        run: 0,
        gap: 0,
        nextGap: scale * 0.6,
        queue: [],
        tail: null,
      };
    });

    next.ui.note("Last one still moving wins");
  },

  input(playerId: string, key: ControlKey, down: boolean) {
    const r = riders.find((x) => x.id === playerId);
    if (!r || !r.alive) return;
    if (key === "left") r.turn = down ? -1 : r.turn === -1 ? 0 : r.turn;
    if (key === "right") r.turn = down ? 1 : r.turn === 1 ? 0 : r.turn;
  },

  tick(dt: number) {
    if (!ctx || over || !board) return;

    elapsed += dt;
    const remaining = Math.max(0, ROUND - elapsed);
    const whole = Math.ceil(remaining);
    if (whole !== lastTimer) {
      lastTimer = whole;
      ctx.ui.timer(remaining);
    }

    carry += speed * dt;
    while (carry >= SUBSTEP) {
      carry -= SUBSTEP;
      for (const r of alive()) advance(r, SUBSTEP);
    }

    for (const r of riders) if (!r.alive && r.falling > 0) r.falling = Math.min(1, r.falling + dt * 2.4);

    settle();
  },

  draw(c: CanvasRenderingContext2D) {
    const tone = readTone(c);
    const line = ink(c);
    const knockout = tone.canvas;
    if (paint && line !== inkColour) {
      paint.globalCompositeOperation = "source-in";
      paint.fillStyle = line;
      paint.fillRect(0, 0, width, height);
      paint.globalCompositeOperation = "source-over";
      inkColour = line;
    }

    if (etch && knockout !== plateColour) {
      etch.globalCompositeOperation = "source-in";
      etch.fillStyle = knockout;
      etch.fillRect(0, 0, width, height);
      etch.globalCompositeOperation = "source-over";
      plateColour = knockout;
    }

    const floor = c.createRadialGradient(
      width * 0.44,
      height * 0.4,
      Math.min(width, height) * 0.05,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.7, tone.floor);
    floor.addColorStop(1, tone.floorEdge);
    c.fillStyle = floor;
    c.fillRect(margin, margin, width - margin * 2, height - margin * 2);

    c.strokeStyle = tone.rim;
    c.lineWidth = Math.max(2, scale * 0.005);
    c.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    if (board) {
      c.save();
      drop(c, tone, thickness * 0.8, thickness * 0.3);
      c.drawImage(board, 0, 0);
      c.restore();
      noDrop(c);
    }
    if (marks) c.drawImage(marks, 0, 0);

    for (const r of riders) {
      if (!r.alive && r.falling >= 1) continue;
      const size = thickness * (r.alive ? 1.35 : 1.35 * (1 - r.falling));

      c.save();
      c.globalAlpha = r.alive ? 1 : 1 - r.falling;
      drop(c, tone, size * 1.2, size * 0.45);
      c.fillStyle = sphere(c, r.x, r.y, size, tone);
      c.beginPath();
      c.arc(r.x, r.y, size, 0, Math.PI * 2);
      c.fill();
      noDrop(c);
      mark(c, r.x, r.y, size, r.skin, knockout);
      c.restore();

      if (r.alive) {
        c.font = `700 ${Math.round(scale * 0.02)}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "bottom";
        c.lineJoin = "round";
        c.lineWidth = Math.max(3, scale * 0.008);
        c.strokeStyle = knockout;
        c.strokeText(r.name, r.x, r.y - size * 1.5);
        c.fillStyle = line;
        c.globalAlpha = 0.75;
        c.fillText(r.name, r.x, r.y - size * 1.5);
        c.globalAlpha = 1;
      }
    }
  },

  preview(c: CanvasRenderingContext2D, t: number) {
    const w = c.canvas.width;
    const h = c.canvas.height;
    const tone = readTone(c);
    const line = tone.ink;
    const knockout = tone.canvas;
    const loop = (t % 7) / 7;

    const floor = c.createRadialGradient(w * 0.44, h * 0.4, 8, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.7, tone.floor);
    floor.addColorStop(1, tone.floorEdge);
    c.fillStyle = floor;
    c.fillRect(6, 6, w - 12, h - 12);
    c.strokeStyle = tone.rim;
    c.lineWidth = 1.5;
    c.strokeRect(6, 6, w - 12, h - 12);

    for (let i = 0; i < 3; i += 1) {
      const phase = i * 2.1;
      const steps = Math.floor(loop * 150);
      c.strokeStyle = line;
      c.lineWidth = 5;
      c.lineCap = "round";
      c.beginPath();
      let x = w / 2;
      let y = h / 2;
      let a = phase;
      for (let s = 0; s < steps; s += 1) {
        const pull = Math.atan2(h / 2 - y, w / 2 - x);
        const off = Math.hypot(x - w / 2, y - h / 2) / (Math.min(w, h) * 0.34);
        let delta = ((pull - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        a += Math.sin(s * 0.06 + phase) * 0.09 + delta * 0.06 * Math.max(0, off - 0.6);
        x += Math.cos(a) * 2.6;
        y += Math.sin(a) * 2.6;
        if (s === 0) c.moveTo(x, y);
        else if (s % 24 !== 0) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();

      c.save();
      drop(c, tone, 9, 3.5);
      c.fillStyle = sphere(c, x, y, 8, tone);
      c.beginPath();
      c.arc(x, y, 8, 0, Math.PI * 2);
      c.fill();
      c.restore();
      mark(c, x, y, 8, i * 3 + 1, knockout);
    }
  },
};
