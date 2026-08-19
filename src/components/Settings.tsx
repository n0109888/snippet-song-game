"use client";

import { TIERS, normalizeStages, type Rules } from "@/lib/round";
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

function seconds(value: number): string {
  return `${Number(value.toFixed(2))}s`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-[0.1em] text-faint">{label}</span>
      {children}
    </div>
  );
}

/** One look for every toggle here, so hints match the difficulty buttons. */
function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`pill h-9 rounded-full border px-4 text-xs ${
        on
          ? "border-transparent bg-accent font-medium text-bg"
          : "border-line text-faint hover:border-line-strong hover:text-muted"
      }`}
    >
      {children}
    </button>
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
  function toggleStage(value: number) {
    const on = rules.stages.includes(value);
    // Never let the last one be switched off, there would be nothing to play.
    if (on && rules.stages.length === 1) return;
    const next = normalizeStages(
      on ? rules.stages.filter((s) => s !== value) : [...rules.stages, value],
    );
    onRules({ ...rules, stages: next });
  }

  return (
    <div className="flex flex-col gap-7">
      <Row label="Difficulty">
        <div className="flex flex-col gap-1.5">
          {TIERS.map((tier) => {
            const on = rules.stages.includes(tier.seconds);
            return (
              <button
                key={tier.seconds}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStage(tier.seconds)}
                style={
                  on
                    ? { backgroundColor: tier.color, borderColor: tier.color }
                    : { borderColor: `color-mix(in srgb, ${tier.color} 35%, transparent)` }
                }
                className={`pill flex h-10 items-center justify-between rounded-full border-2 px-4 ${
                  on ? "text-white" : "hover:brightness-125"
                }`}
              >
                <span
                  className="text-sm font-semibold"
                  style={on ? undefined : { color: tier.color }}
                >
                  {tier.name}
                </span>
                <span
                  className="font-mono text-xs"
                  style={on ? { opacity: 0.85 } : { color: "var(--color-faint)" }}
                >
                  {seconds(tier.seconds)}
                </span>
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Hints">
        <div className="flex flex-wrap gap-1.5">
          <Pill on={rules.artHint} onClick={() => onRules({ ...rules, artHint: !rules.artHint })}>
            Album art
          </Pill>
          <Pill
            on={rules.artistAfter !== null}
            onClick={() =>
              onRules({ ...rules, artistAfter: rules.artistAfter === null ? 2 : null })
            }
          >
            Artist
          </Pill>
        </div>
      </Row>

      <Row label="Song start">
        <div className="flex gap-1.5">
          {(["start", "dropin"] as const).map((mode) => (
            <Pill key={mode} on={startMode === mode} onClick={() => onStartMode(mode)}>
              {mode === "start" ? "Clip start" : "Random"}
            </Pill>
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
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((t) => (
            <Pill key={t} on={theme === t} onClick={() => onTheme(t)}>
              <span className="capitalize">{t}</span>
            </Pill>
          ))}
        </div>
      </Row>
    </div>
  );
}
