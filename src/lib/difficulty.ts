import type { StartMode } from "./types";

export type DifficultyName = "Easy" | "Medium" | "Hard" | "Expert" | "Impossible";
export type DifficultyLabel = DifficultyName | "Custom";

export interface Rules {
  /** Snippet length in seconds for each stage, ascending. */
  stages: number[];
  guesses: number;
  /** Album art shown blurred, sharpening each stage. */
  artHint: boolean;
  /** Artist revealed after this many misses, null when never. */
  artistAfter: number | null;
  /** Impossible forces drop in so the snippet is never the intro. */
  forceDropIn: boolean;
  /** Score weight, harder ladders are worth more. */
  weight: number;
  accent: string;
}

export const DIFFICULTIES: Record<DifficultyName, Rules> = {
  Easy: {
    stages: [2, 4, 7, 12, 20],
    guesses: 5,
    artHint: true,
    artistAfter: 3,
    forceDropIn: false,
    weight: 1,
    accent: "#7FB069",
  },
  Medium: {
    stages: [1, 2, 4, 8, 16],
    guesses: 5,
    artHint: false,
    artistAfter: 4,
    forceDropIn: false,
    weight: 1.3,
    accent: "#E9A13B",
  },
  Hard: {
    stages: [0.5, 1, 2, 5, 10],
    guesses: 4,
    artHint: false,
    artistAfter: null,
    forceDropIn: false,
    weight: 1.7,
    accent: "#DD7230",
  },
  Expert: {
    stages: [0.1, 0.3, 1, 3, 8],
    guesses: 3,
    artHint: false,
    artistAfter: null,
    forceDropIn: false,
    weight: 2.2,
    accent: "#C4453C",
  },
  Impossible: {
    stages: [0.01, 0.05, 0.2, 1],
    guesses: 2,
    artHint: false,
    artistAfter: null,
    forceDropIn: true,
    weight: 3,
    accent: "#9BA0A6",
  },
};

export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as DifficultyName[];

export const ROUND_LENGTH = 10;

/** Which named preset a rule set corresponds to, or Custom once a knob is touched. */
export function labelFor(rules: Rules, startMode: StartMode): DifficultyLabel {
  for (const name of DIFFICULTY_NAMES) {
    const preset = DIFFICULTIES[name];
    const sameStages =
      preset.stages.length === rules.stages.length &&
      preset.stages.every((s, i) => s === rules.stages[i]);
    const sameStart = preset.forceDropIn ? startMode === "dropin" : true;
    if (
      sameStages &&
      preset.guesses === rules.guesses &&
      preset.artHint === rules.artHint &&
      preset.artistAfter === rules.artistAfter &&
      sameStart
    ) {
      return name;
    }
  }
  return "Custom";
}

/**
 * Points for solving at `stageIndex`. Earlier stages are worth more, harder
 * ladders are worth more, and a run of correct answers adds a bounded bonus.
 */
export function scoreFor(stageIndex: number, rules: Rules, streak: number): number {
  const total = rules.stages.length;
  const earliness = (total - stageIndex) / total;
  const base = 100 * earliness * rules.weight;
  const bonus = 1 + Math.min(streak, 5) * 0.1;
  return Math.round(base * bonus);
}
