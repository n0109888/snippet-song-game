"use client";

import {
  ALL_STAGES,
  MODES,
  formatSeconds,
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
  /**
   * Guessable is a five song run and its panel is the run's controls; which
   * way round the page is painted is not one of them, so it is asked about on
   * the mode that has room to ask.
   */
  showTheme: boolean;
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

/**
 * A heading, its glyph, and what it sets. Centred, because the rail is narrow
 * and a left edge that nothing else in it shares reads as a stray indent.
 */
function Row({
  label,
  glyph,
  children,
}: {
  label: string;
  glyph?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        {glyph}
        {label}
      </span>
      {children}
    </div>
  );
}

/** The headings' glyphs, all drawn at one weight so the rail reads down. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      {children}
    </svg>
  );
}

const WAVE = (
  <Glyph>
    <path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3" />
  </Glyph>
);

const CLOCK = (
  <Glyph>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4h2.8M9.5 2.5h5" />
  </Glyph>
);

const BULB = (
  <Glyph>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-.9 1.8v.4h-5.4v-.4c0-.7-.3-1.3-.9-1.8A6 6 0 0 1 12 3z" />
  </Glyph>
);

const SPEAKER = (
  <Glyph>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="M16 9.6a4 4 0 0 1 0 4.8" />
  </Glyph>
);

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
      className={`pill h-8 rounded-full px-3.5 text-xs ${
        on
          ? "bg-accent font-semibold text-bg"
          : "bg-raised text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** The wider version, for a choice that is a sentence rather than a word. */
function Choice({
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
      className={`pill h-10 w-full rounded-full px-4 text-sm ${
        on ? "bg-accent font-semibold text-bg" : "bg-raised text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** A five pip die, which is the whole label on the reroll buttons. */
export function Dice() {
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
    <div className="flex w-full items-center justify-between gap-3">
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
      className="pill grid h-11 flex-1 place-items-center rounded-full bg-raised text-muted hover:text-accent"
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
      className="h-[21px] w-[21px]"
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
  showTheme,
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
  /**
   * Rungs go on and off one at a time, and the order they end up in is the
   * ladder's, not the order they were pressed. The last one standing cannot be
   * taken off, because a ladder with no rungs is not a shorter game.
   */
  function toggleStage(seconds: number) {
    const on = rules.stages.includes(seconds);
    if (on && rules.stages.length <= 1) return;
    const next = ALL_STAGES.filter((s) => (s === seconds ? !on : rules.stages.includes(s)));
    onRules({ ...rules, stages: next });
  }

  return (
    <div className="flex flex-col gap-7">
      {inRound ? (
        <div className="flex gap-1.5">
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
        <button
          type="button"
          onClick={onTracks}
          className="pill flex h-11 items-center justify-between gap-2 rounded-full bg-raised px-4 text-left text-muted hover:text-ink"
        >
          <span className="min-w-0 flex-1 truncate text-sm">{playlistName}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-faint">{trackCount}</span>
        </button>
      ) : null}

      {/* One shuffle is only one of the orders random can deal, so random is the
          only order with anything left to ask for. It is filled rather than
          outlined because it sits here and the order it rerolls sits on the
          card, too far apart for a quiet button to be found. */}
      {canReroll ? (
        <Row label="Shuffle">
          <button
            type="button"
            onClick={onReroll}
            className="reroll flex h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
          >
            <Dice />
            Reroll
          </button>
        </Row>
      ) : null}

      {inRound ? (
        <Row label="Hints" glyph={BULB}>
          <div className="flex flex-wrap justify-center gap-1.5">
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

      {/* Where the snippet is cut from: the preview's own body, which is the
          part of the song a preview is chosen to be, or its very first moment. */}
      <Row label="Song start" glyph={WAVE}>
        <div className="flex w-full flex-col gap-1.5">
          <Choice on={startMode === "dropin"} onClick={() => onStartMode("dropin")}>
            Spotify preview
          </Choice>
          <Choice on={startMode === "start"} onClick={() => onStartMode("start")}>
            From the start
          </Choice>
        </div>
      </Row>

      {/* The rungs. They are cumulative, so this is not six lengths but six
          places the clip is allowed to stop. */}
      <Row label="Stages" glyph={CLOCK}>
        <div className="flex flex-wrap justify-center gap-1.5">
          {ALL_STAGES.map((seconds) => (
            <button
              key={seconds}
              type="button"
              aria-pressed={rules.stages.includes(seconds)}
              onClick={() => toggleStage(seconds)}
              className={`pill h-8 rounded-full px-3 font-mono text-xs tabular-nums ${
                rules.stages.includes(seconds)
                  ? "bg-accent font-medium text-bg"
                  : "bg-raised text-faint hover:text-muted"
              }`}
            >
              {formatSeconds(seconds)}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Volume" glyph={SPEAKER}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Volume"
          onChange={(e) => onVolume(Number(e.target.value))}
          // The track is filled to the thumb, so the level reads without
          // having to find where the dot sits on an unbroken line.
          style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
          className="level w-full"
        />
      </Row>

      <Row label="Mode">
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <Pill key={m.key} on={mode === m.key} onClick={() => onMode(m.key)}>
              {m.label}
            </Pill>
          ))}
        </div>
      </Row>

      {showTheme ? (
        <Row label="Theme">
          <div className="flex gap-1.5">
            {(["dark", "light"] as const).map((t) => (
              <Pill key={t} on={theme === t} onClick={() => onTheme(t)}>
                <span className="capitalize">{t}</span>
              </Pill>
            ))}
          </div>
        </Row>
      ) : null}

      <Row label="Controls">
        <div className="flex w-full flex-col gap-2">
          <Shortcut keys="Space" action="Pause / play" />
          <Shortcut keys="→" action="Skip" />
        </div>
      </Row>
    </div>
  );
}
