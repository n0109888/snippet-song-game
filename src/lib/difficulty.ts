import type { Track } from "./types";

/**
 * Difficulty is about the songs, not the snippet. Easy draws the best known
 * tracks in the loaded playlist, Impossible draws the most obscure. The stage
 * ladder is a separate setting, because that is the skip progression.
 */

export type DifficultyName = "Easy" | "Medium" | "Hard" | "Expert" | "Impossible";

export interface DifficultySpec {
  /** Slice of the playlist ordered by popularity, 0 is the best known. */
  band: [number, number];
  /** Score weight, obscure songs are worth more. */
  weight: number;
  accent: string;
}

export const DIFFICULTIES: Record<DifficultyName, DifficultySpec> = {
  Easy: { band: [0, 0.2], weight: 1, accent: "#7FB069" },
  Medium: { band: [0.2, 0.45], weight: 1.3, accent: "#E9A13B" },
  Hard: { band: [0.45, 0.7], weight: 1.7, accent: "#DD7230" },
  Expert: { band: [0.7, 0.88], weight: 2.2, accent: "#C4453C" },
  Impossible: { band: [0.88, 1], weight: 3, accent: "#9BA0A6" },
};

export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as DifficultyName[];

/** Everything the player can tune, independent of which songs are drawn. */
export interface Rules {
  /** Snippet length per stage, ascending. Skip moves to the next one. */
  stages: number[];
  guesses: number;
  artHint: boolean;
  artistAfter: number | null;
}

export const LADDERS: number[][] = [
  [0.01, 0.1, 0.5, 2, 5, 10],
  [0.01, 0.05, 0.2, 1],
  [0.1, 0.3, 1, 3, 8],
  [0.5, 1, 2, 5, 10],
  [1, 2, 4, 8, 16],
  [2, 4, 7, 12, 20],
];

export const DEFAULT_RULES: Rules = {
  stages: LADDERS[0] ?? [0.01, 0.1, 0.5, 2, 5, 10],
  guesses: 6,
  artHint: false,
  artistAfter: null,
};

export const ROUND_LENGTH = 10;

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Draw a round from the popularity band for `difficulty`. Bands are relative to
 * the loaded playlist, so an obscure playlist still has an Easy end. Tracks
 * with no known rank are used only to top up a short band.
 */
export function pickRound(
  tracks: readonly Track[],
  difficulty: DifficultyName,
  count = ROUND_LENGTH,
): Track[] {
  const ranked = tracks
    .filter((t): t is Track & { rank: number } => typeof t.rank === "number")
    .sort((a, b) => b.rank - a.rank);
  const unranked = tracks.filter((t) => typeof t.rank !== "number");

  if (ranked.length === 0) return shuffle(tracks).slice(0, count);

  const [lo, hi] = DIFFICULTIES[difficulty].band;
  const start = Math.floor(ranked.length * lo);
  const end = Math.max(start + 1, Math.ceil(ranked.length * hi));

  const picked: Track[] = shuffle(ranked.slice(start, end)).slice(0, count);
  if (picked.length >= count) return picked;

  // Band too small for a full round, widen outward through the neighbours.
  const chosen = new Set(picked.map((t) => t.id));
  const rest = [
    ...ranked.slice(end),
    ...ranked.slice(0, start).reverse(),
    ...shuffle(unranked),
  ];
  for (const track of rest) {
    if (picked.length >= count) break;
    if (chosen.has(track.id)) continue;
    chosen.add(track.id);
    picked.push(track);
  }
  return picked;
}

/** Points for solving at `stageIndex`, weighted by difficulty and streak. */
export function scoreFor(
  stageIndex: number,
  stageCount: number,
  difficulty: DifficultyName,
  streak: number,
): number {
  const earliness = (stageCount - stageIndex) / stageCount;
  const base = 100 * earliness * DIFFICULTIES[difficulty].weight;
  return Math.round(base * (1 + Math.min(streak, 5) * 0.1));
}
