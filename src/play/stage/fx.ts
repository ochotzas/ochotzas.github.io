export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIn = (t: number) => t * t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const bump = (t: number) => Math.sin(clamp(t, 0, 1) * Math.PI);

export const approach = (value: number, target: number, rate: number, dt: number) =>
  lerp(value, target, 1 - Math.exp(-rate * dt));

export interface BurstOptions {
  count?: number;
  speed?: number;
  spread?: number;
  angle?: number;
  life?: number;
  size?: number;
  gravity?: number;
  colour?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  colour?: string;
}

interface Ring {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  max: number;
  width: number;
  colour?: string;
}

export interface Fx {
  shake(power: number, seconds?: number): void;
  burst(x: number, y: number, options?: BurstOptions): void;
  ring(x: number, y: number, from: number, to: number, seconds?: number, colour?: string): void;
  update(dt: number): void;
  apply(c: CanvasRenderingContext2D): void;
  draw(c: CanvasRenderingContext2D): void;
  clear(): void;
}

export const createFx = (): Fx => {
  const particles: Particle[] = [];
  const rings: Ring[] = [];
  let power = 0;
  let decay = 0;
  let offsetX = 0;
  let offsetY = 0;

  return {
    shake(next, seconds = 0.35) {
      power = Math.max(power, next);
      decay = Math.max(decay, next / Math.max(seconds, 0.01));
    },

    burst(x, y, options = {}) {
      const {
        count = 12,
        speed = 260,
        spread = Math.PI * 2,
        angle = 0,
        life = 0.5,
        size = 3,
        gravity = 0,
        colour,
      } = options;

      for (let i = 0; i < count; i += 1) {
        const a = angle + (Math.random() - 0.5) * spread;
        const s = speed * (0.35 + Math.random() * 0.65);
        const max = life * (0.6 + Math.random() * 0.8);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: max,
          max,
          size: size * (0.5 + Math.random()),
          gravity,
          colour,
        });
      }
    },

    ring(x, y, from, to, seconds = 0.45, colour) {
      rings.push({ x, y, from, to, life: seconds, max: seconds, width: 3, colour });
    },

    update(dt) {
      if (power > 0) {
        power = Math.max(0, power - decay * dt);
        const a = Math.random() * Math.PI * 2;
        offsetX = Math.cos(a) * power;
        offsetY = Math.sin(a) * power;
      } else {
        offsetX = 0;
        offsetY = 0;
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx -= p.vx * 2.4 * dt;
        p.vy -= p.vy * 2.4 * dt;
      }

      for (let i = rings.length - 1; i >= 0; i -= 1) {
        rings[i].life -= dt;
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
    },

    apply(c) {
      c.translate(offsetX, offsetY);
    },

    draw(c) {
      const base = getComputedStyle(c.canvas).getPropertyValue("--ink").trim() || "#000";

      for (const p of particles) {
        const t = p.life / p.max;
        c.globalAlpha = easeOut(t) * 0.9;
        c.fillStyle = p.colour ?? base;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.3 + t * 0.7), 0, Math.PI * 2);
        c.fill();
      }

      for (const r of rings) {
        const t = 1 - r.life / r.max;
        c.globalAlpha = (1 - t) * 0.6;
        c.strokeStyle = r.colour ?? base;
        c.lineWidth = r.width * (1 - t) + 0.5;
        c.beginPath();
        c.arc(r.x, r.y, lerp(r.from, r.to, easeOut(t)), 0, Math.PI * 2);
        c.stroke();
      }

      c.globalAlpha = 1;
    },

    clear() {
      particles.length = 0;
      rings.length = 0;
      power = 0;
      offsetX = 0;
      offsetY = 0;
    },
  };
};
