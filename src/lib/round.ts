import type { Track } from "./types";

/**
 * Snippet lengths the player can switch on. The ladder is whatever is selected,
 * ascending, and skip walks it one step at a time.
 */
export const STAGE_OPTIONS = [0.01, 0.1, 0.5, 2, 8, 15] as const;

/** 0.01s is opt in, it is a tenth of a blink and most people want it off. */
export const DEFAULT_STAGES: number[] = [0.1, 0.5, 2, 8, 15];

export interface Rules {
  stages: number[];
  guesses: number;
  artHint: boolean;
  artistAfter: number | null;
}

export const DEFAULT_RULES: Rules = {
  stages: DEFAULT_STAGES,
  guesses: DEFAULT_STAGES.length,
  artHint: false,
  artistAfter: null,
};

export type SortKey = "plays" | "random" | "date";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "plays", label: "Most played" },
  { key: "random", label: "Random" },
  { key: "date", label: "Newest first" },
];

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

/** Order the round. Most played first is the default, which starts a pack easy. */
export function sortTracks(tracks: readonly Track[], sort: SortKey): Track[] {
  if (sort === "random") return shuffle(tracks);

  const copy = [...tracks];
  if (sort === "date") {
    // Undated tracks sink to the bottom rather than jumbling the order.
    return copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  return copy.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
}

/** Selected stages, ascending, never empty. */
export function normalizeStages(stages: readonly number[]): number[] {
  const kept = STAGE_OPTIONS.filter((s) => stages.includes(s));
  return kept.length > 0 ? [...kept] : [...DEFAULT_STAGES];
}
