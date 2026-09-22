import type { ControlKey } from "../../protocol";
import { approach, clamp, easeOut, lerp } from "../../stage/fx";
import { drop, noDrop, readTone, sphere } from "../../stage/tone";
import { ink, type Game, type GameContext } from "../types";
import { mark, SKIN_COUNT } from "../../stage/skins";

interface Disc {
  id: string;
  name: string;
  skin: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  falling: number;
  thrust: boolean;
  turn: number;
  hit: number;
  rank: number;
}

const ROUND = 70;
const TURN_RATE = 3.4;

let ctx: GameContext | null = null;
let discs: Disc[] = [];
let arena = 0;
let arenaStart = 0;
let cx = 0;
let cy = 0;
let scale = 0;
let elapsed = 0;
let over = false;
let eliminated = 0;
let lastTimer = -1;

const alive = () => discs.filter((d) => d.alive);

const settle = (): void => {
  if (over || !ctx) return;
  const left = alive();
  if (left.length > 1 && elapsed < ROUND) return;

  over = true;
  const points: Record<string, number> = {};
  left.forEach((d) => {
    d.rank = discs.length;
  });

  discs.forEach((d) => {
    points[d.id] = Math.max(0, d.rank - 1) * 5 + (d.alive ? 15 : 0);
  });

  const champion = left[0];
  const summary = !champion
    ? "Everyone went over the edge"
    : left.length === 1
      ? `${champion.name} was the last one on the disc`
      : `Time — ${left.length} still standing`;

  ctx.ui.timer(null);
  ctx.ui.note(null);
  ctx.finish(points, summary);
};

const kill = (d: Disc) => {
  if (!d.alive || !ctx) return;
  d.alive = false;
  d.falling = 0.001;
  eliminated += 1;
  d.rank = eliminated;

  ctx.fx.burst(d.x, d.y, { count: 22, speed: scale * 2.6, size: scale * 0.05, life: 0.55 });
  ctx.fx.shake(scale * 0.05, 0.4);
  ctx.buzz(d.id, 260);

  const left = alive();
  if (left.length === 1) ctx.ui.banner(`${left[0].name} takes it`, 2200);
  else if (left.length === 0) ctx.ui.banner(`${d.name} is out — nobody left`, 2200);
  else ctx.ui.banner(`${d.name} is out · ${left.length} still up`, 1500);
};

const bounce = (a: Disc, b: Disc, loud: boolean) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const overlap = a.radius + b.radius - dist;
  if (overlap <= 0) return;

  const nx = dx / dist;
  const ny = dy / dist;

  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const along = rvx * nx + rvy * ny;
  if (along > 0) return;

  const push = (a.thrust ? 1.25 : 1) * (b.thrust ? 1.25 : 1);
  const impulse = -(1.55 + push * 0.25) * along * 0.5;

  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;

  const force = Math.abs(along);
  a.hit = 1;
  b.hit = 1;

  if (ctx && loud && force > scale * 0.35) {
    const hx = a.x + nx * a.radius;
    const hy = a.y + ny * a.radius;
    ctx.fx.burst(hx, hy, {
      count: 8,
      speed: force * 0.9,
      size: scale * 0.035,
      life: 0.3,
      spread: Math.PI,
      angle: Math.atan2(ny, nx),
    });
    ctx.fx.ring(hx, hy, scale * 0.04, scale * 0.14, 0.32);
    ctx.fx.shake(clamp(force * 0.012, 0, scale * 0.035), 0.24);
  }
};

export const edge: Game = {
  id: "edge",
  name: "Edge Cases",
  blurb: "One shrinking disc, everyone on it. Turn, thrust, and let physics sort out who deserves to be there.",
  min: 2,
  max: 10,
  layout: {
    dpad: false,
    buttons: [
      { key: "left", label: "◀" },
      { key: "a", label: "THRUST" },
      { key: "right", label: "▶" },
    ],
    hint: "Turn with the arrows, hold THRUST to shove. Do not go over the edge.",
  },

  start(next) {
    ctx = next;
    cx = next.width / 2;
    cy = next.height / 2;
    scale = Math.min(next.width, next.height);
    arenaStart = scale * 0.44;
    arena = arenaStart;
    elapsed = 0;
    over = false;
    eliminated = 0;
    lastTimer = -1;

    const ring = arenaStart * 0.62;
    discs = next.players.map((p, i) => {
      const a = (i / next.players.length) * Math.PI * 2;
      return {
        id: p.id,
        name: p.name,
        skin: i % SKIN_COUNT,
        x: cx + Math.cos(a) * ring,
        y: cy + Math.sin(a) * ring,
        vx: 0,
        vy: 0,
        angle: a + Math.PI,
        radius: scale * 0.047,
        alive: true,
        falling: 0,
        thrust: false,
        turn: 0,
        hit: 0,
        rank: 0,
      };
    });

    next.ui.note("Last one on the disc wins");
  },

  input(playerId: string, key: ControlKey, down: boolean) {
    const d = discs.find((x) => x.id === playerId);
    if (!d || !d.alive) return;
    if (key === "left") d.turn = down ? -1 : d.turn === -1 ? 0 : d.turn;
    if (key === "right") d.turn = down ? 1 : d.turn === 1 ? 0 : d.turn;
    if (key === "a") d.thrust = down;
  },

  tick(dt: number) {
    if (!ctx || over) return;

    elapsed += dt;
    const t = clamp(elapsed / ROUND, 0, 1);
    arena = arenaStart * lerp(1, 0.24, t * t);

    const remaining = Math.max(0, ROUND - elapsed);
    const whole = Math.ceil(remaining);
    if (whole !== lastTimer) {
      lastTimer = whole;
      ctx.ui.timer(remaining);
    }

    for (const d of discs) {
      if (!d.alive) {
        if (d.falling > 0) d.falling = Math.min(1, d.falling + dt * 2.2);
        continue;
      }

      d.angle += d.turn * TURN_RATE * dt;
      d.hit = Math.max(0, d.hit - dt * 4);

      if (d.thrust) {
        const power = scale * 1.9;
        d.vx += Math.cos(d.angle) * power * dt;
        d.vy += Math.sin(d.angle) * power * dt;
      }

      d.vx = approach(d.vx, 0, 1.5, dt);
      d.vy = approach(d.vy, 0, 1.5, dt);

      const speed = Math.hypot(d.vx, d.vy);
      const cap = scale * 0.62;
      if (speed > cap) {
        d.vx = (d.vx / speed) * cap;
        d.vy = (d.vy / speed) * cap;
      }

      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }

    const live = alive();
    for (let pass = 0; pass < 6; pass += 1)
      for (let i = 0; i < live.length; i += 1)
        for (let j = i + 1; j < live.length; j += 1) bounce(live[i], live[j], pass === 0);

    for (const d of live) {
      if (Math.hypot(d.x - cx, d.y - cy) > arena + d.radius * 0.35) kill(d);
    }

    settle();
  },

  draw(c: CanvasRenderingContext2D) {
    const tone = readTone(c);
    const line = ink(c);
    const knockout = tone.canvas;

    const floor = c.createRadialGradient(
      cx - arena * 0.32,
      cy - arena * 0.36,
      arena * 0.08,
      cx,
      cy,
      arena * 1.08,
    );
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.6, tone.floor);
    floor.addColorStop(1, tone.floorEdge);

    c.save();
    drop(c, tone, scale * 0.055, scale * 0.018);
    c.fillStyle = floor;
    c.beginPath();
    c.arc(cx, cy, arena, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.strokeStyle = tone.rim;
    c.lineWidth = Math.max(2, scale * 0.006);
    c.beginPath();
    c.arc(cx, cy, arena, 0, Math.PI * 2);
    c.stroke();

    c.strokeStyle = tone.rim;
    c.lineWidth = Math.max(1, scale * 0.003);
    c.setLineDash([scale * 0.02, scale * 0.03]);
    c.beginPath();
    c.arc(cx, cy, arenaStart * 0.26, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    for (const d of discs) {
      if (!d.alive && d.falling >= 1) continue;

      const fade = d.alive ? 1 : 1 - d.falling;
      const size = d.radius * (d.alive ? 1 + d.hit * 0.14 : 1 - d.falling * 0.8);

      c.save();
      c.globalAlpha = fade;
      c.translate(d.x, d.y);

      if (d.alive && d.thrust) {
        c.save();
        c.globalAlpha = fade * 0.4;
        c.fillStyle = tone.rim;
        c.beginPath();
        c.moveTo(Math.cos(d.angle + 2.2) * size * 0.9, Math.sin(d.angle + 2.2) * size * 0.9);
        c.lineTo(Math.cos(d.angle + Math.PI) * size * 1.5, Math.sin(d.angle + Math.PI) * size * 1.5);
        c.lineTo(Math.cos(d.angle - 2.2) * size * 0.9, Math.sin(d.angle - 2.2) * size * 0.9);
        c.closePath();
        c.fill();
        c.restore();
      }

      drop(c, tone, size * 1.1, size * 0.42);
      c.fillStyle = sphere(c, 0, 0, size, tone);
      c.beginPath();
      c.arc(0, 0, size, 0, Math.PI * 2);
      c.fill();
      noDrop(c);

      mark(c, 0, 0, size, d.skin, knockout);

      c.fillStyle = knockout;
      c.beginPath();
      c.arc(Math.cos(d.angle) * size * 0.66, Math.sin(d.angle) * size * 0.66, size * 0.2, 0, Math.PI * 2);
      c.fill();

      c.restore();

      if (d.alive) {
        c.font = `700 ${Math.round(scale * 0.021)}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "top";
        c.lineJoin = "round";
        c.lineWidth = Math.max(3, scale * 0.008);
        c.strokeStyle = knockout;
        c.strokeText(d.name, d.x, d.y + size * 1.35);
        c.fillStyle = line;
        c.globalAlpha = 0.75;
        c.fillText(d.name, d.x, d.y + size * 1.35);
        c.globalAlpha = 1;
      }
    }
  },

  preview(c: CanvasRenderingContext2D, t: number) {
    const w = c.canvas.width;
    const h = c.canvas.height;
    const s = Math.min(w, h);
    const tone = readTone(c);
    const knockout = tone.canvas;

    const cycle = (t % 6) / 6;
    const r = s * 0.42 * lerp(1, 0.55, easeOut(cycle));

    const floor = c.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.34, r * 0.08, w / 2, h / 2, r * 1.05);
    floor.addColorStop(0, tone.canvas);
    floor.addColorStop(0.6, tone.floor);
    floor.addColorStop(1, tone.floorEdge);
    c.save();
    drop(c, tone, 12, 4);
    c.fillStyle = floor;
    c.beginPath();
    c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.strokeStyle = tone.rim;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    c.stroke();

    c.strokeStyle = tone.rim;
    c.setLineDash([4, 6]);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(w / 2, h / 2, s * 0.42, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    const size = s * 0.075;
    for (let i = 0; i < 3; i += 1) {
      const a = t * (0.9 + i * 0.35) + (i / 3) * Math.PI * 2;
      const orbit = r * (0.52 + Math.sin(t * 1.6 + i) * 0.16);
      const x = w / 2 + Math.cos(a) * orbit;
      const y = h / 2 + Math.sin(a) * orbit;

      c.save();
      drop(c, tone, size * 1.1, size * 0.4);
      c.fillStyle = sphere(c, x, y, size, tone);
      c.beginPath();
      c.arc(x, y, size, 0, Math.PI * 2);
      c.fill();
      c.restore();
      mark(c, x, y, size, i * 3 + 1, knockout);
    }
  },
};
