import type { Track } from "./types";

/**
 * Snippet length is the difficulty. The ladder is whatever is selected,
 * ascending, so a round runs from the hardest length you picked to the easiest.
 */
export interface Tier {
  seconds: number;
  name: string;
  color: string;
}

export const TIERS: Tier[] = [
  { seconds: 0.01, name: "Inhuman", color: "#8e1533" },
  { seconds: 0.1, name: "Impossible", color: "#c22947" },
  { seconds: 0.5, name: "Extreme", color: "#dd5b2e" },
  { seconds: 2, name: "Hard", color: "#e08c1f" },
  { seconds: 8, name: "Medium", color: "#c9b02b" },
  { seconds: 15, name: "Easy", color: "#4fa860" },
];

export const STAGE_OPTIONS = TIERS.map((t) => t.seconds);

export function tierFor(seconds: number): Tier {
  return (
    TIERS.find((t) => t.seconds === seconds) ??
    ({ seconds, name: "Custom", color: "#e9a13b" } satisfies Tier)
  );
}

/** 0.01s is opt in, it is a tenth of a blink and most people want it off. */
export const DEFAULT_STAGES: number[] = [0.1, 0.5, 2, 8, 15];

export interface Rules {
  stages: number[];
}

export const DEFAULT_RULES: Rules = {
  stages: DEFAULT_STAGES,
};

/**
 * Hints are asked for one song at a time, so they live with the round rather
 * than the saved preferences and reset whenever the next song comes up.
 */
export interface Hints {
  art: boolean;
  artist: boolean;
}

export const NO_HINTS: Hints = { art: false, artist: false };

/**
 * True when the pack is a mix of artists rather than one artist's catalogue.
 * Features mean even a single artist pack has other names on it, so the test is
 * whether one name carries most of the songs.
 */
export function isMixedArtist(tracks: readonly Track[]): boolean {
  if (tracks.length === 0) return false;
  const counts = new Map<string, number>();
  let top = 0;
  for (const t of tracks) {
    const n = (counts.get(t.artist) ?? 0) + 1;
    counts.set(t.artist, n);
    if (n > top) top = n;
  }
  return top / tracks.length < 0.5;
}

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
  return kept.length > 0 ? kept : [...DEFAULT_STAGES];
}
