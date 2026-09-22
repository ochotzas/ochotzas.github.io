export const MOVE = 7.6;
export const ACCEL = 62;
export const FRICTION = 46;
export const GRAVITY = 54;
export const JUMP = 16.2;
export const FALL_CAP = 26;
export const COYOTE = 0.09;
export const BUFFER = 0.11;
export const BODY_W = 0.66;
export const BODY_H = 0.92;

export interface Cell {
  solid: boolean;
  ledge: boolean;
  pool: 0 | 1 | 2;
  hazard: boolean;
  gate: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: boolean;
  coyote: number;
  buffer: number;
  want: number;
  jump: boolean;
}

export interface World {
  cols: number;
  rows: number;
  at(cx: number, cy: number): Cell;
  openGates: boolean[];
}

const EMPTY: Cell = { solid: false, ledge: false, pool: 0, hazard: false, gate: -1 };

const blocks = (world: World, cx: number, cy: number) => {
  const cell = world.at(cx, cy);
  if (cell.solid) return true;
  if (cell.gate >= 0 && !world.openGates[cell.gate]) return true;
  return false;
};

export const solidAt = (world: World, x: number, y: number) =>
  blocks(world, Math.floor(x), Math.floor(y));

const spanBlocked = (world: World, x0: number, x1: number, y: number) => {
  for (let cx = Math.floor(x0); cx <= Math.floor(x1); cx += 1) if (blocks(world, cx, Math.floor(y))) return true;
  return false;
};

const ledgeBlocked = (world: World, x0: number, x1: number, y: number) => {
  for (let cx = Math.floor(x0); cx <= Math.floor(x1); cx += 1) {
    const cell = world.at(cx, Math.floor(y));
    if (cell.ledge) return true;
  }
  return false;
};

export const step = (world: World, b: Body, dt: number) => {
  const target = b.want * MOVE;
  if (b.want !== 0) b.vx += Math.sign(target - b.vx) * ACCEL * dt;
  else b.vx -= Math.sign(b.vx) * Math.min(Math.abs(b.vx), FRICTION * dt);
  if (Math.abs(b.vx) > MOVE) b.vx = Math.sign(b.vx) * MOVE;

  b.coyote = b.ground ? COYOTE : Math.max(0, b.coyote - dt);
  b.buffer = b.jump ? BUFFER : Math.max(0, b.buffer - dt);

  if (b.buffer > 0 && b.coyote > 0) {
    b.vy = -JUMP;
    b.buffer = 0;
    b.coyote = 0;
    b.ground = false;
  }

  b.vy = Math.min(b.vy + GRAVITY * dt, FALL_CAP);

  const halfW = BODY_W / 2;

  b.x += b.vx * dt;
  const top = b.y - BODY_H;
  const rows = [top + 0.02, b.y - BODY_H / 2, b.y - 0.02];
  for (const ry of rows) {
    if (b.vx > 0 && spanBlocked(world, b.x + halfW, b.x + halfW, ry)) {
      b.x = Math.floor(b.x + halfW) - halfW - 0.001;
      b.vx = 0;
    } else if (b.vx < 0 && spanBlocked(world, b.x - halfW, b.x - halfW, ry)) {
      b.x = Math.floor(b.x - halfW) + 1 + halfW + 0.001;
      b.vx = 0;
    }
  }

  const wasFeet = b.y;
  b.y += b.vy * dt;
  b.ground = false;

  if (b.vy >= 0) {
    if (spanBlocked(world, b.x - halfW, b.x + halfW, b.y)) {
      b.y = Math.floor(b.y);
      b.vy = 0;
      b.ground = true;
    } else if (
      ledgeBlocked(world, b.x - halfW, b.x + halfW, b.y) &&
      Math.floor(wasFeet) < Math.floor(b.y) &&
      wasFeet <= Math.floor(b.y)
    ) {
      b.y = Math.floor(b.y);
      b.vy = 0;
      b.ground = true;
    }
  } else if (spanBlocked(world, b.x - halfW, b.x + halfW, b.y - BODY_H)) {
    b.y = Math.floor(b.y - BODY_H) + 1 + BODY_H + 0.001;
    b.vy = 0;
  }

  b.jump = false;
};

export const makeWorld = (grid: Cell[][], openGates: boolean[]): World => ({
  cols: grid[0]?.length ?? 0,
  rows: grid.length,
  openGates,
  at(cx, cy) {
    if (cy < 0 || cy >= grid.length) return cy < 0 ? EMPTY : { ...EMPTY, solid: true };
    const row = grid[cy];
    if (cx < 0 || cx >= row.length) return { ...EMPTY, solid: true };
    return row[cx];
  },
});
