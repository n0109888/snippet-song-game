"use client";

import Image from "next/image";
import { HypeEmote } from "./Effects";
import Player from "./Player";
import { formatSeconds } from "@/lib/round";
import type { AudioEngine } from "@/lib/audio";
import type { Track } from "@/lib/types";

interface RevealProps {
  track: Track;
  solved: boolean;
  atLength: number | null;
  /** Solved on the shortest snippet there is, the best the game has to give. */
  max: boolean;
  engine: AudioEngine;
  onNext: () => void;
}

export default function Reveal({ track, solved, atLength, max, engine, onNext }: RevealProps) {
  // The win green is the confetti green, so the badge and the paper agree, and
  // gold takes over the same way when the shortest snippet is named.
  const tone = max ? "var(--color-gold)" : solved ? "var(--color-win)" : "var(--color-bad)";

  return (
    <div className="reveal relative z-10 flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <div className="relative">
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
        {/* Hung off the corner of the sleeve, the way a reaction lands on a clip. */}
        {max ? <HypeEmote className="absolute -bottom-5 -right-6 h-20 w-20" /> : null}
      </div>

      <div className="flex flex-col items-center gap-2">
        {max ? (
          <span className="gold-word text-4xl font-extrabold uppercase leading-none tracking-[0.06em]">
            Inhuman
          </span>
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

      <button
        type="button"
        onClick={onNext}
        className="h-10 rounded-control border border-line-strong px-5 text-sm transition-colors duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)]"
      >
        Next song
      </button>
    </div>
  );
}
