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

/**
 * The shortest snippet on the ladder. Naming one from it is the best result the
 * game has, so a win here gets its own celebration rather than the usual green.
 */
export const INHUMAN_SECONDS = 0.05;

export const TIERS: Tier[] = [
  { seconds: INHUMAN_SECONDS, name: "Inhuman", color: "#8e1533" },
  { seconds: 0.1, name: "Impossible", color: "#c22947" },
  { seconds: 0.5, name: "Extreme", color: "#dd5b2e" },
  { seconds: 2, name: "Hard", color: "#e08c1f" },
  { seconds: 8, name: "Medium", color: "#c9b02b" },
  { seconds: 15, name: "Easy", color: "#4fa860" },
];

export const STAGE_OPTIONS = TIERS.map((t) => t.seconds);

/** Snippet lengths run straight into the unit, everywhere they appear. */
export function formatSeconds(value: number): string {
  return `${Number(value.toFixed(2))}s`;
}

/**
 * A length's share of the widest bar, 0 to 1. Lengths run from 0.05s to 15s, so
 * a straight ratio would leave the short ones too thin to see; the power curve
 * keeps the order and the sense of scale while 0.05s still draws a bar.
 */
export function lengthShare(seconds: number, longest: number): number {
  if (longest <= 0) return 1;
  return (Math.max(0, Math.min(seconds, longest)) / longest) ** 0.35;
}

export function tierFor(seconds: number): Tier {
  return (
    TIERS.find((t) => t.seconds === seconds) ??
    ({ seconds, name: "Custom", color: "#e9a13b" } satisfies Tier)
  );
}

/** 0.05s is opt in, it is a twentieth of a second and most people want it off. */
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

export type SortKey = "plays" | "random" | "date" | "oldest";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "plays", label: "Most played" },
  { key: "random", label: "Random" },
  { key: "date", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
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
  if (sort === "date" || sort === "oldest") {
    const newestFirst = sort === "date";
    // Undated tracks sink to the bottom rather than jumbling the order, which
    // takes an explicit test now that one of the two orders is ascending.
    return copy.sort((a, b) => {
      const x = a.date ?? "";
      const y = b.date ?? "";
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return newestFirst ? y.localeCompare(x) : x.localeCompare(y);
    });
  }
  return copy.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
}

/** Selected stages, ascending, never empty. */
export function normalizeStages(stages: readonly number[]): number[] {
  const kept = STAGE_OPTIONS.filter((s) => stages.includes(s));
  return kept.length > 0 ? kept : [...DEFAULT_STAGES];
}
