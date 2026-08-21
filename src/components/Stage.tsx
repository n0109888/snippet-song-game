"use client";

import { useEffect, useRef } from "react";
import { formatSeconds, lengthShare, tierFor } from "@/lib/round";
import type { AudioEngine } from "@/lib/audio";

interface StageProps {
  stages: number[];
  /** Highest stage the player has unlocked. */
  unlocked: number;
  playing: boolean;
  disabled: boolean;
  loading?: boolean;
  engine: AudioEngine;
  onPlay: () => void;
}

export default function Stage({
  stages,
  unlocked,
  playing,
  disabled,
  loading = false,
  engine,
  onPlay,
}: StageProps) {
  const index = Math.min(unlocked, stages.length - 1);
  const current = stages[index] ?? 0;
  const tier = tierFor(current);
  const longest = Math.max(...stages);
  const fillRef = useRef<HTMLDivElement | null>(null);

  /**
   * The playhead for the stage being played. Written straight to the node on
   * each frame, because a 15s clip would otherwise be nine hundred renders, and
   * wound back to the start whenever playback stops, the way a player does.
   */
  useEffect(() => {
    const node = fillRef.current;
    if (!node) return;
    if (!playing) {
      node.style.width = "0%";
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      node.style.width = `${engine.snippetProgress() * 100}%`;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, engine, index]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* One bar per stage, each as wide as its snippet is long. */}
      <div
        className="flex w-full items-center gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-valuenow={index + 1}
        aria-label="Stage"
      >
        {stages.map((length, i) => {
          const t = tierFor(length);
          const past = i < index;
          const active = i === index;
          return (
            <div
              key={`${length}-${i}`}
              // Grow in proportion, from a zero basis, so the row still fills
              // the card whatever mix of lengths is selected.
              style={{
                flex: `${lengthShare(length, longest)} 0 0%`,
                minWidth: "6px",
                backgroundColor: past
                  ? `color-mix(in srgb, ${t.color} 34%, transparent)`
                  : active
                    ? `color-mix(in srgb, ${t.color} 20%, transparent)`
                    : "var(--color-line)",
              }}
              className="h-2 overflow-hidden rounded-full"
            >
              {active ? (
                <div
                  ref={fillRef}
                  className="h-full w-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span
          className="text-[2rem] font-bold uppercase leading-none tracking-[0.03em]"
          style={{ color: tier.color }}
        >
          {tier.name}
        </span>
        <span className="font-mono text-5xl leading-tight tabular-nums">
          {formatSeconds(current)}
        </span>
      </div>

      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        aria-label={playing ? "Stop" : "Play"}
        className="grid h-32 w-32 shrink-0 place-items-center rounded-full border-[3px] bg-panel transition-transform duration-150 ease-out hover:scale-[1.05] active:scale-[0.96] disabled:opacity-40"
        style={{ borderColor: tier.color }}
      >
        {loading ? (
          <span
            className="block h-8 w-8 animate-pulse rounded-full"
            style={{ backgroundColor: tier.color }}
          />
        ) : playing ? (
          <span className="block h-8 w-8 rounded-[4px]" style={{ backgroundColor: tier.color }} />
        ) : (
          <span
            className="ml-2 block h-0 w-0 border-y-[23px] border-l-[36px] border-y-transparent"
            style={{ borderLeftColor: tier.color }}
          />
        )}
      </button>
    </div>
  );
}
