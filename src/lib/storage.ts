"use client";

import {
  ALL_STAGES,
  DEFAULT_RULES,
  MODES,
  SORTS,
  type Mode,
  type Rules,
  type SortKey,
} from "./round";
import type { SourceKind, StartMode } from "./types";

const KEY = "snippet.prefs.v3";

export type Theme = "dark" | "light";

export interface Prefs {
  rules: Rules;
  mode: Mode;
  sort: SortKey;
  startMode: StartMode;
  volume: number;
  theme: Theme;
  lastSource: SourceKind | null;
  lastSourceId: string | null;
}

export const DEFAULT_PREFS: Prefs = {
  rules: DEFAULT_RULES,
  mode: "guessable",
  sort: "random",
  startMode: "start",
  volume: 0.8,
  theme: "dark",
  lastSource: null,
  lastSourceId: null,
};

function readRules(v: unknown): Rules {
  if (typeof v !== "object" || v === null) return DEFAULT_RULES;
  const r = v as { inhuman?: unknown; stages?: unknown };
  if (Array.isArray(r.stages)) {
    // Rungs that no longer exist are dropped rather than played, and a pick
    // that ends up empty is no game at all, so it falls back to the default.
    const stored = r.stages as unknown[];
    const picked = ALL_STAGES.filter((s) => stored.includes(s));
    return picked.length > 0 ? { stages: picked } : DEFAULT_RULES;
  }
  // Stored while the shortest rung was the only thing left to ask about.
  if (r.inhuman === true) return { stages: ALL_STAGES };
  return DEFAULT_RULES;
}

/** Read synchronously so the first render already has the stored values. */
export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    const p = parsed as Partial<Prefs>;

    return {
      rules: readRules(p.rules),
      // Stored before the modes existed has no mode to read, so it opens on
      // the one a fresh install opens on.
      mode: MODES.some((o) => o.key === p.mode) ? (p.mode as Mode) : DEFAULT_PREFS.mode,
      sort: SORTS.some((o) => o.key === p.sort) ? (p.sort as SortKey) : DEFAULT_PREFS.sort,
      startMode: p.startMode === "dropin" || p.startMode === "start" ? p.startMode : "start",
      volume:
        typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : DEFAULT_PREFS.volume,
      theme: p.theme === "light" ? "light" : "dark",
      lastSource: typeof p.lastSource === "string" ? (p.lastSource as SourceKind) : null,
      lastSourceId: typeof p.lastSourceId === "string" ? p.lastSourceId : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked, preferences simply do not persist.
  }
}
