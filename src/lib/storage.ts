"use client";

import { DEFAULT_RULES, SORTS, normalizeStages, type Rules, type SortKey } from "./round";
import type { SourceKind, StartMode } from "./types";

const KEY = "snippet.prefs.v3";

export type Theme = "dark" | "light";

export interface Prefs {
  rules: Rules;
  sort: SortKey;
  startMode: StartMode;
  volume: number;
  theme: Theme;
  lastSource: SourceKind | null;
  lastSourceId: string | null;
}

export const DEFAULT_PREFS: Prefs = {
  rules: DEFAULT_RULES,
  sort: "plays",
  startMode: "start",
  volume: 0.8,
  theme: "dark",
  lastSource: null,
  lastSourceId: null,
};

function readRules(v: unknown): Rules {
  if (typeof v !== "object" || v === null) return DEFAULT_RULES;
  const r = v as Partial<Rules>;
  return {
    stages: Array.isArray(r.stages) ? normalizeStages(r.stages) : DEFAULT_RULES.stages,
  };
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
