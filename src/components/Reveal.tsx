"use client";

import Image from "next/image";
import Player from "./Player";
import { formatSeconds } from "@/lib/round";
import type { AudioEngine } from "@/lib/audio";
import type { Track } from "@/lib/types";

/** Points the way out of the reveal, which is the only way the round goes. */
function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13" />
      <path d="M12.5 6.2 18.8 12l-6.3 5.8" />
    </svg>
  );
}

interface RevealProps {
  track: Track;
  solved: boolean;
  atLength: number | null;
  /** Solved on the shortest snippet there is, the best the game has to give. */
  max: boolean;
  /** What moving on means here: the next song, or the next level. */
  nextLabel: string;
  engine: AudioEngine;
  onNext: () => void;
}

export default function Reveal({
  track,
  solved,
  atLength,
  max,
  nextLabel,
  engine,
  onNext,
}: RevealProps) {
  // The win green is the confetti green, so the badge and the paper agree, and
  // gold takes over the same way when the shortest snippet is named.
  const tone = max ? "var(--color-gold)" : solved ? "var(--color-win)" : "var(--color-bad)";

  return (
    <div className="reveal relative z-10 flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <div
        className={`h-44 w-44 overflow-hidden rounded-panel bg-panel ${
          max ? "gold-art" : solved ? "glow-in" : "miss-shake"
        }`}
        style={
          solved
            ? {
                // A glow rather than an outline, so the colour bleeds into the card.
                boxShadow: `0 0 60px 6px color-mix(in srgb, ${tone} 52%, transparent), 0 0 150px 40px color-mix(in srgb, ${tone} 22%, transparent)`,
              }
            : undefined
        }
      >
        {track.art ? (
          <Image
            src={track.art}
            alt=""
            width={176}
            height={176}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-2">
        {max ? (
          <div className="mb-1 flex flex-col items-center gap-1">
            {/* The tier that was beaten, then what beating it means, which is
                the line the whole card is built around. */}
            <span className="max-kicker font-mono text-xl font-medium uppercase tracking-[0.3em] text-[var(--color-gold)]">
              Inhuman
            </span>
            <span className="gold-word text-[3.4rem] font-extrabold uppercase leading-[0.95] tracking-[0.02em]">
              Max win
            </span>
          </div>
        ) : null}
        {!solved ? (
          <span
            className="font-mono text-[11px] uppercase tracking-[0.26em]"
            style={{ color: tone }}
          >
            It was&hellip;
          </span>
        ) : null}
        <h2 className="text-balance text-3xl font-bold leading-tight">{track.title}</h2>
        <p className="text-sm text-muted">{track.artist}</p>
      </div>

      <span
        className={`verdict rounded-full border-[3px] px-6 py-2 text-2xl font-extrabold uppercase tracking-[0.04em] ${
          max ? "gold-verdict" : ""
        }`}
        style={{
          borderColor: tone,
          color: tone,
          textShadow: `0 0 20px color-mix(in srgb, ${tone} 60%, transparent)`,
          boxShadow: `0 0 26px -2px color-mix(in srgb, ${tone} 50%, transparent)`,
        }}
      >
        {solved && atLength !== null ? `Guessed in ${formatSeconds(atLength)}!` : "Lost!"}
      </span>

      {/* The clip keeps playing, so you can just listen before moving on. */}
      <Player engine={engine} trackId={track.id} previewUrl={track.preview} autoPlay />

      {/* The one way out, in the app's own colour. It used to take the colour
          of the level it led to, which made the way out of a lost round read as
          part of the verdict it was standing next to. */}
      <button
        type="button"
        onClick={onNext}
        className="pill flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-bg"
      >
        {nextLabel}
        <Arrow />
      </button>
    </div>
  );
}
