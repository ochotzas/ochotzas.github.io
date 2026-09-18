import type { ControlKey } from "../../protocol";
import { clamp, lerp } from "../../stage/fx";
import { mark, SKIN_COUNT } from "../../stage/skins";
import { drop, noDrop, readTone, slab, sphere } from "../../stage/tone";
import { ink, type Game, type GameContext } from "../types";

interface Brick {
  owner: number;
  ring: number;
  a0: number;
  a1: number;
  alive: boolean;
}

interface Keep {
  id: string;
  name: string;
  skin: number;
  index: number;
  a0: number;
  a1: number;
  paddle: number;
  turn: number;
  alive: boolean;
  falling: number;
  rank: number;
  held: Ball | null;
  hold: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const ROUND = 90;
const RINGS = 2;
const HOLD_MAX = 2.2;

let ctx: GameContext | null = null;
let keeps: Keep[] = [];
let bricks: Brick[] = [];
let balls: Ball[] = [];
let cx = 0;
let cy = 0;
let R = 0;
let scale = 0;
let ballR = 0;
let brickDepth = 0;
let paddleR = 0;
let paddleWide = 0;
let elapsed = 0;
let over = false;
let gone = 0;
let lastTimer = -1;
let speed = 0;
let nextBall = 0;

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

const alive = () => keeps.filter((k) => k.alive);

const ringInner = (ring: number) => R * (0.76 + ring * 0.085);

const within = (a: number, a0: number, a1: number) => {
  const t = norm(a - a0);
  return t <= norm(a1 - a0);
};

const sectorOf = (angle: number) => keeps.find((k) => within(angle, k.a0, k.a1)) ?? null;

const settle = () => {
  if (over || !ctx) return;
  const left = alive();
  if (left.length > 1 && elapsed < ROUND) return;

  over = true;
  const standing = (k: Keep) => bricks.filter((b) => b.alive && b.owner === k.index).length;
  [...left]
    .sort((a, b) => standing(a) - standing(b))
    .forEach((k, i) => {
      k.rank = keeps.length - left.length + i + 1;
    });

  const points: Record<string, number> = {};
  keeps.forEach((k) => {
    points[k.id] = Math.max(0, k.rank - 1) * 5 + (k.alive ? 15 : 0);
  });

  const champion = [...left].sort((a, b) => b.rank - a.rank)[0];
  const summary = !champion
    ? "Every wall came down"
    : left.length === 1
      ? `${champion.name} held the last wall standing`
      : `Time — ${champion.name} had the most wall left`;

  ctx.ui.timer(null);
  ctx.ui.note(null);
  ctx.finish(points, summary);
};

const breach = (k: Keep) => {
  if (!k.alive || !ctx) return;
  k.alive = false;
  k.falling = 0.001;
  gone += 1;
  k.rank = gone;

  const mid = k.a0 + norm(k.a1 - k.a0) / 2;
  ctx.fx.burst(cx + Math.cos(mid) * R * 0.9, cy + Math.sin(mid) * R * 0.9, {
    count: 26,
    speed: scale * 2.2,
    size: scale * 0.005,
    life: 0.6,
  });
  ctx.fx.shake(scale * 0.05, 0.45);
  ctx.buzz(k.id, 300);

  if (k.held) {
    balls.push(k.held);
    k.held = null;
  }

  const left = alive();
  if (left.length === 1) ctx.ui.banner(`${left[0].name} takes it`, 2200);
  else if (left.length === 0) ctx.ui.banner(`${k.name} breached — nobody left`, 2200);
  else ctx.ui.banner(`${k.name} breached · ${left.length} still holding`, 1500);
};

const hitBricks = (b: Ball) => {
  const rad = Math.hypot(b.x - cx, b.y - cy);
  const ang = norm(Math.atan2(b.y - cy, b.x - cx));
  const pad = ballR / Math.max(rad, 1);

  for (const brick of bricks) {
    if (!brick.alive) continue;
    const inner = ringInner(brick.ring);
    const outer = inner + brickDepth;
    if (rad + ballR < inner || rad - ballR > outer) continue;
    if (!within(ang, brick.a0 - pad, brick.a1 + pad)) continue;

    brick.alive = false;
    const nx = (b.x - cx) / rad;
    const ny = (b.y - cy) / rad;
    const dot = b.vx * nx + b.vy * ny;
    b.vx -= 2 * dot * nx;
    b.vy -= 2 * dot * ny;
    b.x = cx + nx * (dot > 0 ? inner - ballR : outer + ballR);
    b.y = cy + ny * (dot > 0 ? inner - ballR : outer + ballR);

    if (ctx) {
      ctx.fx.burst(b.x, b.y, { count: 7, speed: scale * 0.9, size: scale * 0.004, life: 0.3 });
      ctx.fx.shake(scale * 0.008, 0.16);
    }
    return;
  }
};

const hitPaddles = (b: Ball) => {
  const rad = Math.hypot(b.x - cx, b.y - cy);
  const ang = norm(Math.atan2(b.y - cy, b.x - cx));
  const inner = paddleR;
  const outer = paddleR + brickDepth * 0.9;
  if (rad + ballR < inner || rad - ballR > outer) return;

  for (const k of keeps) {
    if (!k.alive) continue;
    const half = paddleWide / 2;
    const offset = ((norm(ang - k.paddle) + Math.PI) % TAU) - Math.PI;
    if (Math.abs(offset) > half + ballR / Math.max(rad, 1)) continue;

    const nx = (b.x - cx) / rad;
    const ny = (b.y - cy) / rad;

    if (k.hold > 0 && !k.held) {
      k.held = b;
      balls = balls.filter((x) => x !== b);
      if (ctx) ctx.buzz(k.id, 40);
      return;
    }

    const dot = b.vx * nx + b.vy * ny;
    if (dot < 0) return;
    b.vx -= 2 * dot * nx;
    b.vy -= 2 * dot * ny;

    const spin = (offset / half) * speed * 0.55;
    b.vx += -ny * spin;
    b.vy += nx * spin;

    const mag = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / mag) * speed;
    b.vy = (b.vy / mag) * speed;
    b.x = cx + nx * (inner - ballR);
    b.y = cy + ny * (inner - ballR);

    if (ctx) {
      ctx.fx.ring(b.x, b.y, ballR, ballR * 4, 0.3);
      ctx.fx.shake(scale * 0.01, 0.16);
      ctx.buzz(k.id, 30);
    }
    return;
  }
};

const edge = (b: Ball) => {
  const rad = Math.hypot(b.x - cx, b.y - cy);
  if (rad + ballR < R) return;

  const nx = (b.x - cx) / rad;
  const ny = (b.y - cy) / rad;
  const ang = norm(Math.atan2(b.y - cy, b.x - cx));
  const owner = sectorOf(ang);

  const dot = b.vx * nx + b.vy * ny;
  if (dot > 0) {
    b.vx -= 2 * dot * nx;
    b.vy -= 2 * dot * ny;
  }
  b.x = cx + nx * (R - ballR);
  b.y = cy + ny * (R - ballR);

  if (owner && owner.alive) breach(owner);
};

export const segfault: Game = {
  id: "segfault",
  name: "Segmentation Fault",
  blurb: "You own one slice of the wall. Catch the ball, aim it at somebody else's, and hope yours holds.",
  min: 2,
  max: 10,
  layout: {
    dpad: false,
    buttons: [
      { key: "left", label: "◀" },
      { key: "a", label: "CATCH" },
      { key: "right", label: "▶" },
    ],
    hint: "Slide with the arrows. Hold CATCH to grab the ball, let go to fire it.",
  },

  start(next) {
    ctx = next;
    cx = next.width / 2;
    cy = next.height / 2;
    scale = Math.min(next.width, next.height);
    R = scale * 0.4;
    ballR = scale * 0.016;
    brickDepth = R * 0.065;
    paddleR = R * 0.6;
    elapsed = 0;
    over = false;
    gone = 0;
    lastTimer = -1;
    nextBall = 1;
    speed = scale * 0.42;

    const n = next.players.length;
    const span = TAU / n;
    paddleWide = span * 0.26;

    keeps = next.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      skin: i % SKIN_COUNT,
      index: i,
      a0: norm(i * span - Math.PI / 2),
      a1: norm((i + 1) * span - Math.PI / 2),
      paddle: norm((i + 0.5) * span - Math.PI / 2),
      turn: 0,
      alive: true,
      falling: 0,
      rank: 0,
      held: null,
      hold: 0,
    }));

    bricks = [];
    keeps.forEach((k) => {
      for (let ring = 0; ring < RINGS; ring += 1) {
        const rad = ringInner(ring) + brickDepth / 2;
        const count = Math.max(3, Math.round((span * rad) / (R * 0.11)));
        for (let i = 0; i < count; i += 1) {
          bricks.push({
            owner: k.index,
            ring,
            a0: norm(k.a0 + (span * i) / count),
            a1: norm(k.a0 + (span * (i + 1)) / count),
            alive: true,
          });
        }
      }
    });

    const launch = Math.random() * TAU;
    balls = [
      {
        x: cx,
        y: cy,
        vx: Math.cos(launch) * speed,
        vy: Math.sin(launch) * speed,
      },
    ];

    next.ui.note("Last wall standing wins");
  },

  input(playerId: string, key: ControlKey, down: boolean) {
    const k = keeps.find((x) => x.id === playerId);
    if (!k || !k.alive) return;
    if (key === "left") k.turn = down ? -1 : k.turn === -1 ? 0 : k.turn;
    if (key === "right") k.turn = down ? 1 : k.turn === 1 ? 0 : k.turn;
    if (key === "a") {
      if (down) k.hold = HOLD_MAX;
      else if (k.held) {
        const b = k.held;
        k.held = null;
        k.hold = 0;
        const nx = Math.cos(k.paddle);
        const ny = Math.sin(k.paddle);
        b.x = cx + nx * (paddleR - ballR * 1.2);
        b.y = cy + ny * (paddleR - ballR * 1.2);
        b.vx = -nx * speed;
        b.vy = -ny * speed;
        balls.push(b);
        if (ctx) ctx.fx.ring(b.x, b.y, ballR, ballR * 5, 0.32);
      } else k.hold = 0;
    }
  },

  tick(dt: number) {
    if (!ctx || over) return;

    elapsed += dt;
    const remaining = Math.max(0, ROUND - elapsed);
    const whole = Math.ceil(remaining);
    if (whole !== lastTimer) {
      lastTimer = whole;
      ctx.ui.timer(remaining);
    }

    speed = scale * lerp(0.42, 0.62, clamp(elapsed / ROUND, 0, 1));

    const span = TAU / keeps.length;
    for (const k of keeps) {
      if (!k.alive) {
        if (k.falling > 0) k.falling = Math.min(1, k.falling + dt * 2.2);
        continue;
      }
      if (k.turn !== 0) {
        const half = paddleWide / 2;
        const limit = span / 2 - half;
        const centre = k.a0 + span / 2;
        let offset = ((norm(k.paddle - centre) + Math.PI) % TAU) - Math.PI;
        offset = clamp(offset + k.turn * 2.1 * dt, -limit, limit);
        k.paddle = norm(centre + offset);
      }
      if (k.held) {
        k.hold -= dt;
        k.held.x = cx + Math.cos(k.paddle) * (paddleR - ballR * 1.2);
        k.held.y = cy + Math.sin(k.paddle) * (paddleR - ballR * 1.2);
        if (k.hold <= 0) {
          const b = k.held;
          k.held = null;
          b.vx = -Math.cos(k.paddle) * speed;
          b.vy = -Math.sin(k.paddle) * speed;
          balls.push(b);
        }
      } else if (k.hold > 0) k.hold -= dt;
    }

    if (nextBall < 3 && elapsed > ROUND * (nextBall / 3)) {
      nextBall += 1;
      const a = Math.random() * TAU;
      balls.push({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      ctx.ui.banner(nextBall === 2 ? "Second ball" : "Third ball", 1400);
    }

    const steps = Math.max(1, Math.ceil((speed * dt) / (brickDepth * 0.4)));
    const sub = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      for (const b of balls) {
        const mag = Math.hypot(b.vx, b.vy) || 1;
        b.vx = (b.vx / mag) * speed;
        b.vy = (b.vy / mag) * speed;
        b.x += b.vx * sub;
        b.y += b.vy * sub;
        hitPaddles(b);
        hitBricks(b);
        edge(b);
      }
    }

    settle();
  },

  draw(c: CanvasRenderingContext2D) {
    const tone = readTone(c);
    const line = ink(c);
    const knockout = tone.canvas;

    const floor = c.createRadialGradient(cx - R * 0.3, cy - R * 0.34, R * 0.1, cx, cy, R * 1.06);
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.62, tone.floor);
    floor.addColorStop(1, tone.floorEdge);

    c.save();
    drop(c, tone, scale * 0.05, scale * 0.014);
    c.fillStyle = floor;
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.fill();
    c.restore();

    c.strokeStyle = tone.rim;
    c.lineWidth = Math.max(2, scale * 0.005);
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.stroke();

    for (const brick of bricks) {
      if (!brick.alive) continue;
      const owner = keeps[brick.owner];
      const inner = ringInner(brick.ring);
      const fade = owner.alive ? 1 : 1 - owner.falling;
      if (fade <= 0) continue;

      const mid = brick.a0 + norm(brick.a1 - brick.a0) / 2;
      const rad = inner + brickDepth / 2;
      const bx = cx + Math.cos(mid) * rad;
      const by = cy + Math.sin(mid) * rad;

      c.save();
      c.globalAlpha = fade;
      drop(c, tone, brickDepth * 0.55, brickDepth * 0.2);
      c.fillStyle = slab(c, bx - brickDepth, by - brickDepth, bx + brickDepth, by + brickDepth, tone);
      c.beginPath();
      c.arc(cx, cy, inner + brickDepth * 0.92, brick.a0 + 0.006, brick.a1 - 0.006);
      c.arc(cx, cy, inner + brickDepth * 0.08, brick.a1 - 0.006, brick.a0 + 0.006, true);
      c.closePath();
      c.fill();
      noDrop(c);

      c.strokeStyle = tone.structureLit;
      c.lineWidth = Math.max(1, brickDepth * 0.07);
      c.beginPath();
      c.arc(cx, cy, inner + brickDepth * 0.9, brick.a0 + 0.008, brick.a1 - 0.008);
      c.stroke();

      mark(c, bx, by, brickDepth * 0.32, owner.skin, knockout);
      c.restore();
    }

    for (const k of keeps) {
      if (!k.alive && k.falling >= 1) continue;
      c.save();
      c.globalAlpha = k.alive ? 1 : 1 - k.falling;
      drop(c, tone, brickDepth * 0.7, brickDepth * 0.28);
      const px = cx + Math.cos(k.paddle) * paddleR;
      const py = cy + Math.sin(k.paddle) * paddleR;
      c.strokeStyle = slab(c, px - brickDepth, py - brickDepth, px + brickDepth, py + brickDepth, tone);
      c.lineWidth = brickDepth * 0.82;
      c.lineCap = "round";
      c.beginPath();
      c.arc(cx, cy, paddleR, k.paddle - paddleWide / 2, k.paddle + paddleWide / 2);
      c.stroke();
      noDrop(c);
      c.strokeStyle = tone.structureLit;
      c.lineWidth = Math.max(1, brickDepth * 0.08);
      c.beginPath();
      c.arc(cx, cy, paddleR - brickDepth * 0.3, k.paddle - paddleWide / 2.4, k.paddle + paddleWide / 2.4);
      c.stroke();
      c.restore();

      if (!k.alive) continue;

      const mid = k.a0 + norm(k.a1 - k.a0) / 2;
      const lx = cx + Math.cos(mid) * R * 1.09;
      const ly = cy + Math.sin(mid) * R * 1.09;
      c.font = `700 ${Math.round(scale * 0.022)}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
      c.textAlign = Math.cos(mid) > 0.3 ? "left" : Math.cos(mid) < -0.3 ? "right" : "center";
      c.textBaseline = Math.sin(mid) > 0.3 ? "top" : Math.sin(mid) < -0.3 ? "bottom" : "middle";
      c.lineJoin = "round";
      c.lineWidth = Math.max(3, scale * 0.008);
      c.strokeStyle = knockout;
      c.strokeText(k.name, lx, ly);
      c.fillStyle = line;
      c.globalAlpha = 0.8;
      c.fillText(k.name, lx, ly);
      c.globalAlpha = 1;
    }

    const draw = [...balls, ...keeps.map((k) => k.held).filter((b): b is Ball => b !== null)];
    for (const b of draw) {
      c.save();
      drop(c, tone, ballR * 1.6, ballR * 0.7);
      c.fillStyle = sphere(c, b.x, b.y, ballR, tone);
      c.beginPath();
      c.arc(b.x, b.y, ballR, 0, TAU);
      c.fill();
      noDrop(c);
      c.fillStyle = tone.canvas;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(b.x - ballR * 0.3, b.y - ballR * 0.34, ballR * 0.26, 0, TAU);
      c.fill();
      c.restore();
    }
  },

  preview(c: CanvasRenderingContext2D, t: number) {
    const w = c.canvas.width;
    const h = c.canvas.height;
    const s = Math.min(w, h);
    const tone = readTone(c);
    const knockout = tone.canvas;
    const r = s * 0.42;
    const depth = r * 0.075;

    const floor = c.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.34, r * 0.1, w / 2, h / 2, r * 1.05);
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.62, tone.floor);
    floor.addColorStop(1, tone.floorEdge);
    c.save();
    drop(c, tone, 10, 3);
    c.fillStyle = floor;
    c.beginPath();
    c.arc(w / 2, h / 2, r, 0, TAU);
    c.fill();
    c.restore();
    c.strokeStyle = tone.rim;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(w / 2, h / 2, r, 0, TAU);
    c.stroke();

    const n = 4;
    for (let k = 0; k < n; k += 1) {
      for (let ring = 0; ring < 3; ring += 1) {
        for (let i = 0; i < 4; i += 1) {
          const gap = (k * 4 + i + ring * 2 + Math.floor(t * 1.4)) % 9 === 0;
          if (gap) continue;
          const a0 = (k / n) * TAU + (i / (4 * n)) * TAU + 0.02;
          const a1 = a0 + TAU / (4 * n) - 0.04;
          const inner = r * (0.7 + ring * 0.09);
          const bm = (a0 + a1) / 2;
          const brx = w / 2 + Math.cos(bm) * (inner + depth / 2);
          const bry = h / 2 + Math.sin(bm) * (inner + depth / 2);
          c.fillStyle = slab(c, brx - depth, bry - depth, brx + depth, bry + depth, tone);
          c.beginPath();
          c.arc(w / 2, h / 2, inner + depth * 0.9, a0, a1);
          c.arc(w / 2, h / 2, inner, a1, a0, true);
          c.closePath();
          c.fill();
        }
      }
      const pa = (k / n) * TAU + TAU / (2 * n) + Math.sin(t * 1.3 + k) * 0.22;
      c.strokeStyle = tone.ink;
      c.lineWidth = depth * 0.9;
      c.lineCap = "round";
      c.beginPath();
      c.arc(w / 2, h / 2, r * 0.56, pa - 0.16, pa + 0.16);
      c.stroke();
    }

    const ba = t * 2.1;
    const bd = r * 0.4 * (0.5 + Math.sin(t * 2.6) * 0.5);
    const bx = w / 2 + Math.cos(ba) * bd;
    const by = h / 2 + Math.sin(ba) * bd;
    c.fillStyle = sphere(c, bx, by, 7, tone);
    c.beginPath();
    c.arc(bx, by, 7, 0, TAU);
    c.fill();
    c.fillStyle = knockout;
    c.beginPath();
    c.arc(bx - 2, by - 2.4, 2, 0, TAU);
    c.fill();
  },
};
