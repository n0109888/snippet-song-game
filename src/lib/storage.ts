"use client";

import { DEFAULT_RULES, DIFFICULTIES, type DifficultyName, type Rules } from "./difficulty";
import type { SourceKind, StartMode } from "./types";

const KEY = "snippet.prefs.v2";

export interface Prefs {
  difficulty: DifficultyName;
  rules: Rules;
  startMode: StartMode;
  volume: number;
  lastSource: SourceKind | null;
  lastSourceId: string | null;
}

export const DEFAULT_PREFS: Prefs = {
  difficulty: "Medium",
  rules: DEFAULT_RULES,
  startMode: "start",
  volume: 0.8,
  lastSource: null,
  lastSourceId: null,
};

function isRules(v: unknown): v is Rules {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<Rules>;
  return (
    Array.isArray(r.stages) &&
    r.stages.length > 0 &&
    r.stages.every((s) => typeof s === "number" && s > 0) &&
    typeof r.guesses === "number" &&
    r.guesses > 0 &&
    typeof r.artHint === "boolean" &&
    (r.artistAfter === null || typeof r.artistAfter === "number")
  );
}

/**
 * Read synchronously so the first render already has the stored values and
 * there is no flash of defaults.
 */
export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    const p = parsed as Partial<Prefs>;

    return {
      difficulty:
        p.difficulty && p.difficulty in DIFFICULTIES ? p.difficulty : DEFAULT_PREFS.difficulty,
      rules: isRules(p.rules) ? p.rules : DEFAULT_PREFS.rules,
      startMode: p.startMode === "dropin" || p.startMode === "start" ? p.startMode : "start",
      volume:
        typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : DEFAULT_PREFS.volume,
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
