"use client";

import {
  INHUMAN_SECONDS,
  MODES,
  formatSeconds,
  inkOn,
  tierFor,
  type Hints,
  type Mode,
  type Rules,
} from "@/lib/round";
import type { StartMode } from "@/lib/types";

interface SettingsProps {
  rules: Rules;
  hints: Hints;
  mode: Mode;
  /** Hints and the round controls only mean anything while a round is up. */
  inRound: boolean;
  /** Rerolling needs a round to reroll and a shuffle to reroll it into. */
  canReroll: boolean;
  /** One artist's pack already answers the artist hint, so it is left out. */
  showArtistHint: boolean;
  /** Name and size of what is loaded, so an import can be checked at a glance. */
  playlistName: string | null;
  trackCount: number;
  startMode: StartMode;
  volume: number;
  theme: "dark" | "light";
  onStartMode: (mode: StartMode) => void;
  onMode: (mode: Mode) => void;
  onReroll: () => void;
  onRules: (rules: Rules) => void;
  onHints: (hints: Hints) => void;
  onVolume: (value: number) => void;
  onTheme: (theme: "dark" | "light") => void;
  onHome: () => void;
  onHistory: () => void;
  onReset: () => void;
  onTracks: () => void;
}

/** The optional rung, named and coloured wherever the button draws it. */
const INHUMAN = tierFor(INHUMAN_SECONDS);

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

/** A five pip die, which is the whole label on the reroll button. */
function Dice() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="dice h-4 w-4">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <g fill="currentColor">
        <circle cx="8.6" cy="8.6" r="1.45" />
        <circle cx="15.4" cy="8.6" r="1.45" />
        <circle cx="12" cy="12" r="1.45" />
        <circle cx="8.6" cy="15.4" r="1.45" />
        <circle cx="15.4" cy="15.4" r="1.45" />
      </g>
    </svg>
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
  mode,
  inRound,
  canReroll,
  showArtistHint,
  playlistName,
  trackCount,
  startMode,
  volume,
  theme,
  onStartMode,
  onMode,
  onReroll,
  onRules,
  onHints,
  onVolume,
  onTheme,
  onHome,
  onHistory,
  onReset,
  onTracks,
}: SettingsProps) {
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
        </Row>
      ) : null}

      <Row label="Mode">
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <Pill key={m.key} on={mode === m.key} onClick={() => onMode(m.key)}>
              {m.label}
            </Pill>
          ))}
        </div>
      </Row>

      {/* One shuffle is only one of the orders random can deal, so random is the
          only order with anything left to ask for. It is filled rather than
          outlined because it sits here and the order it rerolls sits on the
          card, too far apart for a quiet button to be found. */}
      {canReroll ? (
        <Row label="Shuffle">
          <button
            type="button"
            onClick={onReroll}
            className="reroll flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium"
          >
            <Dice />
            Reroll
          </button>
        </Row>
      ) : null}

      {/* The one rung that is optional, and the only rule left to set. It goes
          without a heading over it: the button says Inhuman and 0.05s, which is
          the whole of what a heading could have added. It runs half the width of
          the panel rather than all of it, because one switch left on its own does
          not need the breadth of the six it replaced. */}
      <button
        type="button"
        aria-pressed={rules.inhuman}
        onClick={() => onRules({ ...rules, inhuman: !rules.inhuman })}
        style={
          rules.inhuman
            ? {
                backgroundColor: INHUMAN.color,
                borderColor: INHUMAN.color,
                color: inkOn(INHUMAN.color),
              }
            : { borderColor: `color-mix(in srgb, ${INHUMAN.color} 35%, transparent)` }
        }
        className={`pill flex h-10 w-1/2 items-center justify-between gap-2 rounded-full border-2 px-3 ${
          rules.inhuman ? "" : "hover:brightness-125"
        }`}
      >
        <span
          className="text-sm font-semibold"
          style={rules.inhuman ? undefined : { color: INHUMAN.color }}
        >
          {INHUMAN.name}
        </span>
        <span
          className="font-mono text-xs"
          style={rules.inhuman ? { opacity: 0.85 } : { color: "var(--color-faint)" }}
        >
          {formatSeconds(INHUMAN.seconds)}
        </span>
      </button>

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
