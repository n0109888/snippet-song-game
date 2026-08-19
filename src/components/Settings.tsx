"use client";

import { useState } from "react";
import { LADDERS, ladderLabel, type Rules } from "@/lib/difficulty";
import type { StartMode } from "@/lib/types";

interface SettingsProps {
  rules: Rules;
  startMode: StartMode;
  volume: number;
  theme: "dark" | "light";
  onStartMode: (mode: StartMode) => void;
  onRules: (rules: Rules) => void;
  onVolume: (value: number) => void;
  onTheme: (theme: "dark" | "light") => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-[0.08em] text-faint">{label}</span>
      {children}
    </div>
  );
}

export default function Settings({
  rules,
  startMode,
  volume,
  theme,
  onStartMode,
  onRules,
  onVolume,
  onTheme,
}: SettingsProps) {
  const [advanced, setAdvanced] = useState(false);

  const currentIndex = LADDERS.findIndex(
    (l) =>
      l.stages.length === rules.stages.length && l.stages.every((s, i) => s === rules.stages[i]),
  );

  return (
    <div className="flex flex-col gap-7">
      <Row label="Stages">
        <div className="flex flex-col gap-1.5">
          <select
            aria-label="Stage ladder"
            value={currentIndex >= 0 ? currentIndex : 0}
            onChange={(e) => {
              const ladder = LADDERS[Number(e.target.value)];
              if (!ladder) return;
              onRules({
                ...rules,
                stages: ladder.stages,
                guesses: Math.max(rules.guesses, ladder.stages.length),
              });
            }}
            className="h-9 w-full rounded-control border border-line bg-panel px-2 text-sm text-ink focus:border-line-strong"
          >
            {LADDERS.map((ladder, i) => (
              <option key={ladder.name} value={i}>
                {ladder.name}
              </option>
            ))}
          </select>
          <span className="font-mono text-[11px] text-faint">{ladderLabel(rules.stages)}</span>
        </div>
      </Row>

      <Row label="Start">
        <div className="flex gap-2">
          {(["start", "dropin"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onStartMode(mode)}
              className={`h-8 flex-1 rounded-chip border px-2 text-xs transition-colors duration-150 ease-out ${
                startMode === mode
                  ? "border-line-strong text-ink"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {mode === "start" ? "Clip start" : "Random"}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Volume">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Volume"
          onChange={(e) => onVolume(Number(e.target.value))}
          className="w-full"
        />
      </Row>

      <Row label="Theme">
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTheme(t)}
              className={`h-8 flex-1 rounded-chip border px-2 text-xs capitalize transition-colors duration-150 ease-out ${
                theme === t
                  ? "border-line-strong text-ink"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="flex items-center gap-2 text-left text-xs uppercase tracking-[0.08em] text-faint transition-colors duration-150 ease-out hover:text-muted"
        >
          <span
            className="inline-block h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent transition-transform duration-150 ease-out"
            style={{
              borderLeftColor: "currentColor",
              transform: advanced ? "rotate(90deg)" : "none",
            }}
          />
          Advanced
        </button>

        {advanced ? (
          <div className="flex flex-col gap-5">
            <Row label="Guesses">
              <div className="flex gap-1">
                {[2, 3, 4, 5, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRules({ ...rules, guesses: n })}
                    className={`h-8 flex-1 rounded-chip border font-mono text-xs transition-colors duration-150 ease-out ${
                      rules.guesses === n
                        ? "border-line-strong text-ink"
                        : "border-line text-muted hover:text-ink"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Hints">
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={rules.artHint}
                    onChange={(e) => onRules({ ...rules, artHint: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                  Album art
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={rules.artistAfter !== null}
                    onChange={(e) =>
                      onRules({ ...rules, artistAfter: e.target.checked ? 3 : null })
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  Artist
                </label>
              </div>
            </Row>
          </div>
        ) : null}
      </div>
    </div>
  );
}
