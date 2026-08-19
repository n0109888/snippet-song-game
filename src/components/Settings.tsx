"use client";

import { useState } from "react";
import { STAGE_OPTIONS, normalizeStages, type Rules } from "@/lib/round";
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

function label(seconds: number): string {
  return `${Number(seconds.toFixed(2))}s`;
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
  theme,
  onStartMode,
  onRules,
  onVolume,
  onTheme,
}: SettingsProps) {
  const [advanced, setAdvanced] = useState(false);

  function toggleStage(value: number) {
    const on = rules.stages.includes(value);
    // Never let the last stage be switched off, there would be nothing to play.
    if (on && rules.stages.length === 1) return;
    const next = normalizeStages(
      on ? rules.stages.filter((s) => s !== value) : [...rules.stages, value],
    );
    onRules({ ...rules, stages: next });
  }

  return (
    <div className="flex flex-col gap-7">
      <Row label="Stages">
        <div className="flex flex-wrap gap-1.5">
          {STAGE_OPTIONS.map((value) => {
            const on = rules.stages.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStage(value)}
                className={`h-8 rounded-full border px-3 font-mono text-xs transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-95 ${
                  on
                    ? "border-transparent bg-accent text-bg"
                    : "border-line text-faint hover:border-line-strong hover:text-muted"
                }`}
              >
                {label(value)}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Song start">
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
                      onRules({ ...rules, artistAfter: e.target.checked ? 2 : null })
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
