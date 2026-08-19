"use client";

import { useState } from "react";
import { LADDERS, type Rules } from "@/lib/difficulty";
import type { StartMode } from "@/lib/types";

interface SettingsProps {
  rules: Rules;
  startMode: StartMode;
  volume: number;
  onStartMode: (mode: StartMode) => void;
  onRules: (rules: Rules) => void;
  onVolume: (value: number) => void;
}

function label(stages: number[]): string {
  return stages.map((s) => (s < 1 ? s.toString() : String(s))).join(" ");
}

function Row({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-[0.08em] text-faint">{text}</span>
      {children}
    </div>
  );
}

export default function Settings({
  rules,
  startMode,
  volume,
  onStartMode,
  onRules,
  onVolume,
}: SettingsProps) {
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-7">
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
              {mode === "start" ? "From the start" : "Drop in"}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Stages">
        <div className="flex flex-col gap-1">
          {LADDERS.map((stages) => {
            const selected =
              stages.length === rules.stages.length &&
              stages.every((s, i) => s === rules.stages[i]);
            return (
              <button
                key={label(stages)}
                type="button"
                onClick={() =>
                  onRules({
                    ...rules,
                    stages,
                    // Keep every stage reachable unless the guess count was raised.
                    guesses: Math.max(rules.guesses, stages.length),
                  })
                }
                className={`h-8 rounded-chip border px-2 text-left font-mono text-xs transition-colors duration-150 ease-out ${
                  selected
                    ? "border-line-strong text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {label(stages)}
              </button>
            );
          })}
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
