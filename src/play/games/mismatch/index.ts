import type { ControlKey } from "../../protocol";
import { clamp } from "../../stage/fx";
import { readTone } from "../../stage/tone";
import type { Game, GameContext } from "../types";
import { generate } from "./generate";
import { rooms as authored, type Room } from "./levels";
import { BODY_H, BODY_W, makeWorld, step, type Body, type Cell, type World } from "./physics";
import { drawBody, drawExit, drawLevel, drawPlate, fitView, type View } from "./render";

interface Runner {
  id: string;
  name: string;
  element: 1 | 2;
  body: Body;
  facing: number;
  ghost: number;
  home: boolean;
}

interface Plate {
  cx: number;
  cy: number;
  group: number;
  heat: number;
}

const ROUND = 240;
const GENERATED = 4;
const PLATES = "pqr";
const GATES = "PQR";

let ctx: GameContext | null = null;
let runners: Runner[] = [];
let grid: Cell[][] = [];
let world: World | null = null;
let plates: Plate[] = [];
let openGates = [false, false, false];
let spawns: { a: [number, number][]; b: [number, number][] } = { a: [], b: [] };
let exits: { a: [number, number]; b: [number, number] } = { a: [0, 0], b: [0, 0] };
let view: View = { size: 1, ox: 0, oy: 0 };
let index = 0;
let cleared = 0;
let elapsed = 0;
let clock = 0;
let over = false;
let lastTimer = -1;
let lock = 0;
let deck: Room[] = [];
let seed = 0;

const parse = (lines: string[]) => {
  grid = [];
  plates = [];
  spawns = { a: [], b: [] };
  openGates = [false, false, false];

  lines.forEach((line, r) => {
    const row: Cell[] = [];
    [...line].forEach((ch, q) => {
      const cell: Cell = { solid: false, ledge: false, pool: 0, hazard: false, gate: -1 };
      if (ch === "#") cell.solid = true;
      else if (ch === "=") cell.ledge = true;
      else if (ch === "~") cell.pool = 1;
      else if (ch === ":") cell.pool = 2;
      else if (ch === "X") cell.hazard = true;
      else if (ch === "1") spawns.a.push([q, r]);
      else if (ch === "2") spawns.b.push([q, r]);
      else if (ch === "a") exits.a = [q, r];
      else if (ch === "b") exits.b = [q, r];
      else if (PLATES.includes(ch)) {
        cell.solid = true;
        plates.push({ cx: q, cy: r, group: PLATES.indexOf(ch), heat: 0 });
      } else if (GATES.includes(ch)) cell.gate = GATES.indexOf(ch);
      row.push(cell);
    });
    grid.push(row);
  });

  world = makeWorld(grid, openGates);
};

const place = () => {
  runners.forEach((r, i) => {
    const list = r.element === 1 ? spawns.a : spawns.b;
    const spot = list[Math.floor(i / 2) % Math.max(1, list.length)] ?? [2, 2];
    r.body.x = spot[0] + 0.5;
    r.body.y = spot[1] + 1;
    r.body.vx = 0;
    r.body.vy = 0;
    r.body.want = 0;
    r.body.jump = false;
    r.body.ground = false;
    r.ghost = 0;
    r.home = false;
  });
};

const load = (n: number) => {
  parse(deck[n].grid);
  place();
  if (ctx) {
    view = fitView(ctx.width, ctx.height, grid[0].length, grid.length);
    ctx.ui.note(`Room ${n + 1} of ${deck.length} — ${deck[n].name}`);
  }
};

const settle = (why: string) => {
  if (over || !ctx) return;
  over = true;
  const points: Record<string, number> = {};
  const award = cleared * 20 + (cleared === deck.length ? 40 : 0);
  runners.forEach((r) => (points[r.id] = award));
  ctx.ui.timer(null);
  ctx.ui.note(null);
  ctx.finish(points, why);
};

const wipe = (reason: string) => {
  if (!ctx || lock > 0) return;
  lock = 1.1;
  ctx.fx.shake(Math.min(ctx.width, ctx.height) * 0.04, 0.4);
  ctx.ui.banner(reason, 1300);
  runners.forEach((r) => ctx?.buzz(r.id, 180));
  place();
};

const lethal = (cell: Cell, element: 1 | 2) =>
  cell.hazard || (cell.pool !== 0 && cell.pool !== element);

export const mismatch: Game = {
  id: "mismatch",
  name: "Type Mismatch",
  blurb:
    "Two incompatible types, one exit each. Your puddle is safe, theirs is fatal, and the rooms are generated fresh every time you play.",
  min: 2,
  max: 8,
  layout: {
    dpad: false,
    buttons: [
      { key: "left", label: "◀" },
      { key: "a", label: "JUMP" },
      { key: "right", label: "▶" },
    ],
    hint: "Walk and jump. Stand on a plate to hold a door for the others.",
  },

  start(next) {
    ctx = next;
    index = 0;
    cleared = 0;
    elapsed = 0;
    clock = 0;
    over = false;
    lastTimer = -1;
    lock = 0;

    seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const fresh = generate(seed, GENERATED);
    deck = fresh.length === GENERATED ? [authored[0], ...fresh] : authored;

    runners = next.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      element: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      body: { x: 0, y: 0, vx: 0, vy: 0, ground: false, coyote: 0, buffer: 0, want: 0, jump: false },
      facing: 1,
      ghost: 0,
      home: false,
    }));

    load(0);
  },

  input(playerId: string, key: ControlKey, down: boolean) {
    const r = runners.find((x) => x.id === playerId);
    if (!r) return;
    if (key === "left") r.body.want = down ? -1 : r.body.want === -1 ? 0 : r.body.want;
    if (key === "right") r.body.want = down ? 1 : r.body.want === 1 ? 0 : r.body.want;
    if (key === "a" && down) r.body.jump = true;
    if (r.body.want !== 0) r.facing = r.body.want;
  },

  tick(dt: number) {
    if (!ctx || over || !world) return;

    clock += dt;
    elapsed += dt;
    const remaining = Math.max(0, ROUND - elapsed);
    const whole = Math.ceil(remaining);
    if (whole !== lastTimer) {
      lastTimer = whole;
      ctx.ui.timer(remaining);
    }
    if (remaining <= 0) {
      settle(cleared === 0 ? "Time — no rooms cleared" : `Time — ${cleared} of ${deck.length} rooms cleared`);
      return;
    }

    if (lock > 0) {
      lock = Math.max(0, lock - dt);
      return;
    }

    const held = [false, false, false];
    for (const plate of plates) {
      const on = runners.some(
        (r) =>
          Math.abs(r.body.x - (plate.cx + 0.5)) < 0.6 &&
          Math.abs(r.body.y - plate.cy) < 0.25 &&
          r.body.ground,
      );
      plate.heat = clamp(plate.heat + (on ? dt * 8 : -dt * 8), 0, 1);
      if (on) held[plate.group] = true;
    }
    openGates[0] = held[0];
    openGates[1] = held[1];
    openGates[2] = held[2];

    const sub = Math.min(dt, 1 / 60);
    for (const r of runners) {
      step(world, r.body, sub);
      if (r.body.want !== 0) r.facing = r.body.want;

      if (r.body.y > grid.length + 2) {
        wipe(`${r.name} fell out of the world`);
        return;
      }

      const cell = world.at(Math.floor(r.body.x), Math.floor(r.body.y - BODY_H * 0.5));
      const feet = world.at(Math.floor(r.body.x), Math.floor(r.body.y - 0.05));
      if (lethal(cell, r.element) || lethal(feet, r.element)) {
        wipe(`${r.name} met the wrong type`);
        return;
      }
    }

    for (const r of runners) {
      const door = r.element === 1 ? exits.a : exits.b;
      r.home =
        Math.abs(r.body.x - (door[0] + 0.5)) < 1.5 && Math.abs(r.body.y - (door[1] + 1)) < 1.3;
    }

    if (runners.every((r) => r.home)) {
      cleared += 1;
      if (cleared >= deck.length) {
        settle(`All ${deck.length} rooms cleared`);
        return;
      }
      index += 1;
      ctx.ui.banner(`Room ${index} clear`, 1400);
      ctx.fx.shake(Math.min(ctx.width, ctx.height) * 0.02, 0.3);
      lock = 1;
      load(index);
    }
  },

  draw(c: CanvasRenderingContext2D) {
    if (!grid.length) return;
    const tone = readTone(c);
    view = fitView(c.canvas.width, c.canvas.height, grid[0].length, grid.length);
    const s = view.size;

    drawLevel(c, grid, view, openGates, plates.map((p) => p.heat), clock);

    for (const plate of plates)
      drawPlate(c, view.ox + plate.cx * s, view.oy + plate.cy * s, s, plate.heat);

    const everyoneHome = (el: 1 | 2) => runners.filter((r) => r.element === el).every((r) => r.home);
    drawExit(c, view.ox + exits.a[0] * s, view.oy + exits.a[1] * s, s, 1, everyoneHome(1), clock);
    drawExit(c, view.ox + exits.b[0] * s, view.oy + exits.b[1] * s, s, 2, everyoneHome(2), clock);

    for (const r of runners) {
      const px = view.ox + r.body.x * s;
      const py = view.oy + r.body.y * s;
      drawBody(c, px, py, BODY_W * s, BODY_H * s, r.element, r.facing, r.ghost);

      c.font = `700 ${Math.round(s * 0.34)}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.lineJoin = "round";
      c.lineWidth = Math.max(2, s * 0.12);
      c.strokeStyle = tone.canvas;
      c.strokeText(r.name, px, py - BODY_H * s - s * 0.18);
      c.fillStyle = tone.ink;
      c.globalAlpha = 0.8;
      c.fillText(r.name, px, py - BODY_H * s - s * 0.18);
      c.globalAlpha = 1;
    }
  },

  preview(c: CanvasRenderingContext2D, t: number) {
    const tone = readTone(c);
    const w = c.canvas.width;
    const h = c.canvas.height;
    const s = h / 7;

    const back = c.createRadialGradient(w / 2, h * 0.35, s, w / 2, h / 2, w * 0.7);
    back.addColorStop(0, tone.canvas);
    back.addColorStop(0.7, tone.floor);
    back.addColorStop(1, tone.floorEdge);
    c.fillStyle = back;
    c.fillRect(0, 0, w, h);

    c.fillStyle = tone.ink;
    c.fillRect(0, h - s, w, s);
    c.fillStyle = tone.structureLit;
    c.fillRect(0, h - s, w, s * 0.09);

    c.fillStyle = tone.floorEdge;
    c.fillRect(w * 0.42, h - s, w * 0.16, s);
    c.strokeStyle = tone.rim;
    c.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      c.beginPath();
      c.moveTo(w * 0.42, h - s + (i * s) / 4 + Math.sin(t * 2) * 2);
      c.lineTo(w * 0.58, h - s + (i * s) / 4 + Math.sin(t * 2) * 2);
      c.stroke();
    }

    const hop = Math.max(0, Math.sin(t * 2.1)) * s * 1.5;
    const pair: [number, 1 | 2][] = [
      [w * 0.3, 1],
      [w * 0.7, 2],
    ];
    pair.forEach(([x, el], i) => {
      const lift = i === 0 ? hop : Math.max(0, Math.sin(t * 2.1 + 1)) * s * 1.5;
      drawBody(c, x, h - s - lift, s * 0.5, s * 0.72, el, i === 0 ? 1 : -1, 0);
    });

    c.strokeStyle = tone.rim;
    c.lineWidth = 3;
    [w * 0.12, w * 0.88].forEach((x, i) => {
      c.beginPath();
      c.moveTo(x - s * 0.3, h - s);
      c.lineTo(x - s * 0.3, h - s * 1.5);
      c.arc(x, h - s * 1.5, s * 0.3, Math.PI, 0);
      c.lineTo(x + s * 0.3, h - s);
      c.stroke();
      void i;
    });
  },
};
