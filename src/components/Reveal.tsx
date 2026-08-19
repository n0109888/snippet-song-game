"use client";

import Image from "next/image";
import type { Track } from "@/lib/types";

interface RevealProps {
  track: Track;
  solved: boolean;
  atLength: number | null;
  onNext: () => void;
}

function format(seconds: number): string {
  return `${Number(seconds.toFixed(2))}s`;
}

export default function Reveal({ track, solved, atLength, onNext }: RevealProps) {
  const tone = solved ? "var(--color-good)" : "var(--color-bad)";

  return (
    <button
      type="button"
      onClick={onNext}
      aria-label="Next"
      className="reveal flex w-full max-w-lg cursor-pointer flex-col items-center gap-6 text-center"
    >
      <div
        className={`h-44 w-44 overflow-hidden rounded-panel border bg-panel ${solved ? "" : "miss-shake"}`}
        style={{ borderColor: tone }}
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
        {!solved ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
            It was
          </span>
        ) : null}
        <h2 className="text-balance text-3xl leading-tight">{track.title}</h2>
        <p className="text-sm text-muted">{track.artist}</p>
      </div>

      <span
        className="rounded-chip border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]"
        style={{ borderColor: tone, color: tone }}
      >
        {solved && atLength !== null ? `Guessed ${format(atLength)}` : "Missed"}
      </span>
    </button>
  );
}
