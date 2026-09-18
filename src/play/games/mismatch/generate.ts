import { BODY_H, makeWorld, step, type Body, type Cell } from "./physics";

const W = 24;
const H = 9;
const FLOOR = 7;
const WALK = 6;

export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const cellOf = (ch: string): Cell => {
  const cell: Cell = { solid: false, ledge: false, pool: 0, hazard: false, gate: -1 };
  if (ch === "#") cell.solid = true;
  else if (ch === "=") cell.ledge = true;
  else if (ch === "~") cell.pool = 1;
  else if (ch === ":") cell.pool = 2;
  else if (ch === "X") cell.hazard = true;
  else if ("pqr".includes(ch)) cell.solid = true;
  else if ("PQR".includes(ch)) cell.gate = "PQR".indexOf(ch);
  return cell;
};

export const toGrid = (lines: string[]) => lines.map((line) => [...line].map(cellOf));

const lethal = (cell: Cell, el: 1 | 2) => cell.hazard || (cell.pool !== 0 && cell.pool !== el);

export const walkable = (lines: string[], el: 1 | 2): boolean => {
  const grid = toGrid(lines);
  const world = makeWorld(grid, [true, true, true]);
  const find = (ch: string) => {
    for (let r = 0; r < lines.length; r += 1) {
      const q = lines[r].indexOf(ch);
      if (q >= 0) return [q, r] as [number, number];
    }
    return null;
  };
  const from = find(el === 1 ? "1" : "2");
  const to = find(el === 1 ? "a" : "b");
  if (!from || !to) return false;

  const body: Body = {
    x: from[0] + 0.5,
    y: from[1] + 1,
    vx: 0,
    vy: 0,
    ground: false,
    coyote: 0,
    buffer: 0,
    want: 0,
    jump: false,
  };
  const dt = 1 / 120;
  const supports = (c: number, r: number) => {
    const cell = world.at(c, r);
    if (cell.solid || cell.ledge) return true;
    return cell.pool !== 0 && cell.pool === el;
  };

  for (let t = 0; t < 30; t += dt) {
    const dir = Math.sign(to[0] + 0.5 - body.x) || 1;
    body.want = dir;
    const ahead = Math.floor(body.x + dir * 0.8);
    const row = Math.floor(body.y);
    const blocked = world.at(ahead, row - 1).solid;
    const gap = !supports(ahead, row);
    const deadly = lethal(world.at(ahead, row), el) || lethal(world.at(ahead, row - 1), el);
    if (body.ground && (blocked || gap || deadly || to[1] < row - 2)) body.jump = true;

    step(world, body, dt);

    if (
      lethal(world.at(Math.floor(body.x), Math.floor(body.y - BODY_H * 0.5)), el) ||
      lethal(world.at(Math.floor(body.x), Math.floor(body.y - 0.05)), el)
    )
      return false;
    if (body.y > lines.length + 2) return false;
    if (Math.abs(body.x - (to[0] + 0.5)) < 1.5 && Math.abs(body.y - (to[1] + 1)) < 1.3) return true;
  }
  return false;
};

const NAMES = [
  "Undefined Behaviour",
  "Off By One",
  "Stack Overflow",
  "Dangling Pointer",
  "Silent Cast",
  "Unreachable Code",
  "Buffer Overrun",
  "Circular Import",
  "Lost Update",
  "Dirty Read",
  "Orphan Process",
  "Double Free",
];

const layFloor = (rand: () => number, pools: number) => {
  const floor: string[] = new Array(W).fill("#");
  for (let i = 0; i < pools; i += 1) {
    const span = rand() < 0.4 ? 2 : 3;
    const options: number[] = [];
    for (let x = 6; x + span <= W - 8; x += 1) {
      let ok = true;
      for (let k = -2; k < span + 2; k += 1) if (floor[x + k] !== "#") ok = false;
      if (ok) options.push(x);
    }
    if (!options.length) break;
    const at = options[Math.floor(rand() * options.length)];
    const ch = rand() < 0.5 ? "~" : ":";
    for (let k = 0; k < span; k += 1) floor[at + k] = ch;
  }
  return floor;
};

const clearRun = (floor: string[], x: number) =>
  floor[x] === "#" && floor[x - 1] === "#" && floor[x + 1] === "#";

export const build = (seed: number, difficulty: number): { name: string; grid: string[] } | null => {
  const rand = seeded(seed);
  const pools = 1 + Math.floor(rand() * Math.min(1 + difficulty, 3));
  const gates = difficulty >= 2 ? (difficulty >= 4 ? 2 : 1) : 0;

  const floor = layFloor(rand, pools);
  const rows: string[][] = [];
  for (let r = 0; r < H; r += 1) {
    const row: string[] = new Array(W).fill(r === 0 || r === H - 1 ? "#" : ".");
    row[0] = "#";
    row[W - 1] = "#";
    rows.push(row);
  }
  for (let q = 1; q < W - 1; q += 1) rows[FLOOR][q] = floor[q];
  rows[FLOOR][0] = "#";
  rows[FLOOR][W - 1] = "#";

  const used = new Set<number>([2, 4]);
  const pillars: number[] = [];

  for (let g = 0; g < gates; g += 1) {
    const spots: number[] = [];
    for (let x = 9 + g * 5; x < W - 7; x += 1)
      if (clearRun(floor, x) && pillars.every((p) => Math.abs(p - x) > 4)) spots.push(x);
    if (!spots.length) return null;
    const at = spots[Math.floor(rand() * spots.length)];
    pillars.push(at);

    const gate = "PQR"[g];
    for (let r = 1; r <= 4; r += 1) rows[r][at] = "#";
    rows[5][at] = gate;
    rows[WALK][at] = gate;

    const plate = "pqr"[g];
    const side = (dir: number) => {
      for (let d = 2; d < 8; d += 1) {
        const x = at + dir * d;
        if (x < 2 || x > W - 3) break;
        if (floor[x] === "#" && !used.has(x)) return x;
      }
      return -1;
    };
    const left = side(-1);
    const right = side(1);
    if (left < 0 || right < 0) return null;
    used.add(left);
    used.add(right);
    rows[FLOOR][left] = plate;
    rows[FLOOR][right] = plate;
  }

  const ea = W - 7 + Math.floor(rand() * 2);
  const eb = ea + 2 + Math.floor(rand() * 2);
  if (floor[2] !== "#" || floor[4] !== "#") return null;
  if (eb > W - 2 || rows[FLOOR][ea] !== "#" || rows[FLOOR][eb] !== "#") return null;
  rows[WALK][2] = "1";
  rows[WALK][4] = "2";
  rows[WALK][ea] = "a";
  rows[WALK][eb] = "b";

  const grid = rows.map((r) => r.join(""));
  if (grid.some((r) => r.length !== W)) return null;
  if (!walkable(grid, 1) || !walkable(grid, 2)) return null;

  return { name: NAMES[seed % NAMES.length], grid };
};

export const generate = (seed: number, count: number) => {
  const out: { name: string; grid: string[] }[] = [];
  const seen = new Set<string>();
  let s = seed >>> 0;
  for (let slot = 0; slot < count; slot += 1) {
    let room: { name: string; grid: string[] } | null = null;
    for (let drop = 0; drop <= slot && !room; drop += 1) {
      for (let attempt = 0; attempt < 600 && !room; attempt += 1) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const made = build(s, slot + 1 - drop);
        if (made && !seen.has(made.grid.join())) room = made;
      }
    }
    if (!room) break;
    seen.add(room.grid.join());
    out.push(room);
  }
  return out;
};
