export type ControlKey = "up" | "down" | "left" | "right" | "a" | "b" | "back";

export interface Choice {
  id: string;
  label: string;
  note?: string;
  danger?: boolean;
  locked?: boolean;
}

export interface RoleCard {
  job: string;
  blurb: string;
  ability: string;
  ready: boolean;
  secrets: string[];
}

export interface PadLayout {
  dpad: boolean;
  buttons: { key: ControlKey; label: string }[];
  hint: string;
  back?: boolean;
  captain?: boolean;
  choices?: Choice[];
  card?: RoleCard | null;
}

export interface Player {
  id: string;
  name: string;
  slot: number;
  score: number;
  connected: boolean;
}

export type PadMessage =
  | { t: "join"; name: string }
  | { t: "prefs"; theme: "light" | "dark" }
  | { t: "input"; k: ControlKey; d: boolean }
  | { t: "choice"; id: string }
  | { t: "leave" };

export type HostMessage =
  | { t: "welcome"; slot: number; layout: PadLayout; screen: string }
  | { t: "layout"; layout: PadLayout; screen: string }
  | { t: "buzz"; ms: number }
  | { t: "full" };

export const SLOT_NAMES = ["One", "Two", "Three", "Four", "Five", "Six"];
export const MAX_PLAYERS = 10;

export const roomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};
