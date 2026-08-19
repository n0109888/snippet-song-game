"use client";

import { TIERS, formatSeconds, normalizeStages, type Hints, type Rules } from "@/lib/round";
import type { StartMode } from "@/lib/types";

interface SettingsProps {
  rules: Rules;
  hints: Hints;
  /** Hints and the round controls only mean anything while a round is up. */
  inRound: boolean;
  /** One artist's pack already answers the artist hint, so it is left out. */
  showArtistHint: boolean;
  /** Name and size of what is loaded, so an import can be checked at a glance. */
  playlistName: string | null;
  trackCount: number;
  startMode: StartMode;
  volume: number;
  theme: "dark" | "light";
  onStartMode: (mode: StartMode) => void;
  onRules: (rules: Rules) => void;
  onHints: (hints: Hints) => void;
  onVolume: (value: number) => void;
  onTheme: (theme: "dark" | "light") => void;
  onHome: () => void;
  onHistory: () => void;
  onReset: () => void;
  onTracks: () => void;
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

/** A keyboard shortcut, spelled out so the round can be played without the mouse. */
function Shortcut({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{action}</span>
      <kbd className="rounded-control border border-line px-2 py-1 font-mono text-[11px] leading-none text-faint">
        {keys}
      </kbd>
    </div>
  );
}

/** The round's own controls, kept to icons so they stay out of the way. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="pill grid h-12 flex-1 place-items-center rounded-full border border-line-strong text-ink hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

/**
 * Drawn rather than typed, because the glyphs for these were tiny and sat off
 * centre. Stroked so all three read at the same weight.
 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-[22px] w-[22px]"
    >
      {children}
    </svg>
  );
}

export default function Settings({
  rules,
  hints,
  inRound,
  showArtistHint,
  playlistName,
  trackCount,
  startMode,
  volume,
  theme,
  onStartMode,
  onRules,
  onHints,
  onVolume,
  onTheme,
  onHome,
  onHistory,
  onReset,
  onTracks,
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
      {inRound ? (
        <div className="flex gap-1.5 border-b border-line pb-5">
          <IconButton label="Back to packs" onClick={onHome}>
            <Icon>
              <path d="M3.5 10.5 12 3.5l8.5 7" />
              <path d="M5.5 9.5V20h13V9.5" />
              <path d="M9.75 20v-5.5h4.5V20" />
            </Icon>
          </IconButton>
          <IconButton label="This round" onClick={onHistory}>
            <Icon>
              <path d="M4 6.5h16M4 12h16M4 17.5h16" />
            </Icon>
          </IconButton>
          <IconButton label="Start over" onClick={onReset}>
            <Icon>
              <path d="M20 12a8 8 0 1 1-2.5-5.8" />
              <path d="M20 3.5V7h-3.5" />
            </Icon>
          </IconButton>
        </div>
      ) : null}

      {inRound && playlistName ? (
        <Row label="Playlist">
          <button
            type="button"
            onClick={onTracks}
            className="pill flex h-11 items-center justify-between gap-2 rounded-control border border-line px-3 text-left hover:border-line-strong"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{playlistName}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
              {trackCount}
            </span>
          </button>
          <span className="text-xs text-faint">Tap to see every song.</span>
        </Row>
      ) : null}

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
                  {formatSeconds(tier.seconds)}
                </span>
              </button>
            );
          })}
        </div>
      </Row>

      {inRound ? (
        <Row label="Hints">
          <div className="flex flex-wrap gap-1.5">
            <Pill on={hints.art} onClick={() => onHints({ ...hints, art: !hints.art })}>
              Album art
            </Pill>
            {showArtistHint ? (
              <Pill on={hints.artist} onClick={() => onHints({ ...hints, artist: !hints.artist })}>
                Artist
              </Pill>
            ) : null}
          </div>
          <span className="text-xs text-faint">Off again on the next song.</span>
        </Row>
      ) : null}

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

      <Row label="Controls">
        <div className="flex flex-col gap-2">
          <Shortcut keys="Space" action="Pause / play" />
          <Shortcut keys="→" action="Skip" />
        </div>
      </Row>
    </div>
  );
}
