import { edge } from "./edge";
import { mismatch } from "./mismatch";
import { segfault } from "./segfault";
import { trail } from "./trail";
import type { Game } from "./types";

export const games: Game[] = [mismatch, trail, segfault, edge];
export type { Game };
