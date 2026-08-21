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

export function shuffle<T>(items: readonly T[]): T[] {
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

function byPlays(a: Track, b: Track): number {
  return (b.rank ?? -1) - (a.rank ?? -1);
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
      const gap = newestFirst ? y.localeCompare(x) : x.localeCompare(y);
      // Dates a release only records to the year all land on the first of
      // January, so a year of songs would otherwise sit in file order.
      return gap !== 0 ? gap : byPlays(a, b);
    });
  }
  return copy.sort(byPlays);
}

/** Selected stages, ascending, never empty. */
export function normalizeStages(stages: readonly number[]): number[] {
  const kept = STAGE_OPTIONS.filter((s) => stages.includes(s));
  return kept.length > 0 ? kept : [...DEFAULT_STAGES];
}

/**
 * How the whole game is shaped.
 *
 * `classic` is the ladder: one song at a time, and every wrong guess or skip
 * buys you a longer piece of it.
 *
 * `guessable` turns the ladder on its side. The lengths become levels played
 * once each, easiest first, and the pack is split by play count so the level
 * and the song agree: the Easy level draws a song everybody knows and gets 15
 * seconds of it, Impossible draws one nobody plays and gives you a tenth of a
 * second. One song per level, one guess each.
 */
export type Mode = "classic" | "guessable";

export const MODES: { key: Mode; label: string; note: string }[] = [
  { key: "classic", label: "Classic", note: "One song, longer on every miss." },
  { key: "guessable", label: "Guessable", note: "One song per level, one guess each." },
];

/**
 * The selected lengths as levels, easiest first. Ascending is the ladder's
 * order because it climbs; a level run starts on the longest piece instead.
 */
export function levelsFor(stages: readonly number[]): number[] {
  return [...normalizeStages(stages)].reverse();
}

export interface Band {
  seconds: number;
  /** Every song of that level's popularity, most played first. */
  pool: Track[];
}

/**
 * Split a pack into one band of play counts per level. Most played sit in the
 * first band and get the longest piece, least played in the last and get the
 * shortest, so a level's name describes its song as much as its snippet.
 */
export function bandsFor(tracks: readonly Track[], levels: readonly number[]): Band[] {
  const ranked = [...tracks].sort(byPlays);
  const bands: Band[] = [];
  // A pack thinner than the ladder gives a level each to the songs it has,
  // rather than dealing the same song into two levels.
  const count = Math.min(levels.length, ranked.length);
  for (let i = 0; i < count; i += 1) {
    const seconds = levels[i];
    if (seconds === undefined) continue;
    const from = Math.floor((i * ranked.length) / count);
    const to = Math.floor(((i + 1) * ranked.length) / count);
    const pool = ranked.slice(from, to);
    if (pool.length > 0) bands.push({ seconds, pool });
  }
  return bands;
}
