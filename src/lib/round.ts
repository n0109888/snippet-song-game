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
 * `classic` plays the pack in the chosen order, a song at a time, for as long
 * as you like.
 *
 * `guessable` plays five songs, one per level, drawn from the pack by play
 * count: Easy is a song everybody knows, Impossible is one nobody plays. The
 * snippet ladder inside a level is the same as classic's, so every level opens
 * on the shortest length selected and every miss buys a longer piece. Naming
 * the song is what moves you up a level.
 */
export type Mode = "classic" | "guessable";

export const MODES: { key: Mode; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "guessable", label: "Guessable" },
];

export interface Level {
  name: string;
  color: string;
  /** What to write on the colour once it is a fill rather than an outline. */
  ink: string;
}

/**
 * Black or white, whichever the fill can carry. The stage palette runs from a
 * mid green through yellow and orange to a deep crimson, so one fixed choice
 * is unreadable at one end or the other: white disappears on the yellow and
 * black disappears on the crimson.
 */
export function inkOn(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex?.[1]) return "#ffffff";
  const n = Number.parseInt(hex[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return luminance > 0.18 ? "#12100e" : "#ffffff";
}

/**
 * The levels, easiest song first. They take their colours from the stages of
 * the same name, so the two readings of Easy and Impossible are one palette:
 * on a stage it is how much of the song you get, on a level it is how well
 * known the song is.
 */
export const LEVELS: Level[] = ["Easy", "Medium", "Hard", "Extreme", "Impossible"].map(
  (name) => {
    const color = TIERS.find((t) => t.name === name)?.color ?? "#e9a13b";
    return { name, color, ink: inkOn(color) };
  },
);

/**
 * The songs a level draws from: its own fifth of the pack by play count. The
 * first level takes the most played fifth and the last the least, so the level
 * describes the song as much as the snippet does.
 */
export function bandFor(tracks: readonly Track[], level: number): Track[] {
  if (tracks.length === 0) return [];
  const ranked = [...tracks].sort(byPlays);
  const at = Math.max(0, Math.min(level, LEVELS.length - 1));
  const from = Math.floor((at * ranked.length) / LEVELS.length);
  const to = Math.floor(((at + 1) * ranked.length) / LEVELS.length);
  // A pack thinner than the ladder can leave a band empty; it falls back to the
  // whole pack rather than to no song at all.
  const pool = ranked.slice(from, to);
  return pool.length > 0 ? pool : ranked;
}
