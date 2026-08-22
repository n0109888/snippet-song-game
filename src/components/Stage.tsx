"use client";

import { useEffect, useRef } from "react";
import { formatSeconds, inkOn, lengthShare, tierFor } from "@/lib/round";
import type { AudioEngine } from "@/lib/audio";

interface StageProps {
  stages: number[];
  /** Highest stage the player has unlocked. */
  unlocked: number;
  playing: boolean;
  disabled: boolean;
  loading?: boolean;
  /**
   * Guessable runs the whole ladder in its level's colour, and names the level
   * on the picker above rather than here, so the stage's own name is left off.
   */
  tone?: string | null;
  engine: AudioEngine;
  onPlay: () => void;
}

export default function Stage({
  stages,
  unlocked,
  playing,
  disabled,
  loading = false,
  tone = null,
  engine,
  onPlay,
}: StageProps) {
  const index = Math.min(unlocked, stages.length - 1);
  const current = stages[index] ?? 0;
  const tier = tierFor(current);
  const shade = tone ?? tier.color;
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
    <div className="flex flex-col items-center gap-10">
      {/*
       * One bar, cut into rungs rather than built out of five. A rung is as
       * wide as its snippet is long, and the ones already heard stay filled,
       * because the ladder plays the clip straight through: reaching 8s after
       * 2s buys the six seconds between them, so the fill really is how much
       * of the song has sounded.
       */}
      <div
        className="flex w-full items-center gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-valuenow={index + 1}
        aria-label="Stage"
      >
        {stages.map((length, i) => {
          const colour = tone ?? tierFor(length).color;
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
                  ? colour
                  : active
                    ? `color-mix(in srgb, ${colour} 22%, transparent)`
                    : "var(--color-line)",
              }}
              className="h-2.5 overflow-hidden rounded-full"
            >
              {active ? (
                <div
                  ref={fillRef}
                  className="h-full w-0 rounded-full"
                  style={{ backgroundColor: colour }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {/*
       * The button is the middle of the card and stays there, so the length
       * beside it is placed off the centre line rather than laid out next to
       * it: a run from 0.01s to 15s changes that label's width, and a centred
       * row would walk the button left and right as the ladder climbed. The
       * offset is measured from the centre for the same reason, so the gap to
       * the button is the same whether the length is two characters or five.
       */}
      <div className="relative flex w-full items-center justify-center">
        {tone ? null : (
          <span
            className="absolute right-1/2 mr-28 text-right text-lg font-bold uppercase leading-none tracking-[0.03em]"
            style={{ color: tier.color }}
          >
            {tier.name}
          </span>
        )}

        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          aria-label={playing ? "Stop" : "Play"}
          // Dimmed rather than greyed while the audio is still coming: it is
          // the same button a moment early, not a broken one.
          className="orb grid h-32 w-32 shrink-0 place-items-center rounded-full disabled:opacity-60"
          style={{
            backgroundColor: shade,
            color: inkOn(shade),
            boxShadow: `0 0 46px -4px color-mix(in srgb, ${shade} 70%, transparent)`,
          }}
        >
          {loading ? (
            <span className="block h-9 w-9 animate-pulse rounded-full bg-current" />
          ) : playing ? (
            <span className="flex items-center gap-[7px]">
              <span className="block h-9 w-[11px] rounded-[2px] bg-current" />
              <span className="block h-9 w-[11px] rounded-[2px] bg-current" />
            </span>
          ) : (
            <span
              className="ml-2 block h-0 w-0 border-y-[21px] border-l-[33px] border-y-transparent"
              style={{ borderLeftColor: "currentColor" }}
            />
          )}
        </button>

        <span
          className="absolute left-1/2 ml-28 font-mono text-3xl leading-none tabular-nums"
          style={{ color: shade }}
        >
          {formatSeconds(current)}
        </span>
      </div>
    </div>
  );
}
