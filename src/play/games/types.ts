import type { ControlKey, PadLayout, Player } from "../protocol";
import type { Fx } from "../stage/fx";
import type { Overlay } from "../stage/overlay";

export interface GameContext {
  players: Player[];
  width: number;
  height: number;
  fx: Fx;
  ui: Overlay;
  buzz(playerId: string, ms: number): void;
  pad(playerId: string, layout: PadLayout): void;
  finish(points: Record<string, number>, summary: string): void;
}

export interface Game {
  id: string;
  name: string;
  blurb: string;
  min: number;
  max: number;
  layout: PadLayout;
  start(ctx: GameContext): void;
  input(playerId: string, key: ControlKey, down: boolean): void;
  choice?(playerId: string, id: string): void;
  tick(dt: number): void;
  draw(c: CanvasRenderingContext2D): void;
  preview?(c: CanvasRenderingContext2D, t: number): void;
}

export const ink = (c: CanvasRenderingContext2D) =>
  getComputedStyle(c.canvas).getPropertyValue("--ink").trim() || "#000";
export const faint = (c: CanvasRenderingContext2D) =>
  getComputedStyle(c.canvas).getPropertyValue("--faint").trim() || "#999";
export const fill = (c: CanvasRenderingContext2D) =>
  getComputedStyle(c.canvas).getPropertyValue("--separator").trim() || "#eee";

export const text = (
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign = "center",
  color?: string,
) => {
  c.fillStyle = color ?? ink(c);
  c.font = `800 ${size}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(value, x, y);
};
