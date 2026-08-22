"use client";

import { useEffect, useRef } from "react";
import { formatSeconds, inkOn, lengthShare, tierFor } from "@/lib/round";
import type { AudioEngine } from "@/lib/audio";

interface StageProps {
  stages: number[];
  /** Highest stage the player has unlocked. */
  unlocked: number;
  playing: boolean;
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

  /** Where on the bar this stage begins, which is where the one below it ended. */
  const opens = index === 0 ? 0 : (stages[index - 1] ?? 0);

  /**
   * The playhead for the stage being played. Written straight to the node on
   * each frame, because a 15s clip would otherwise be nine hundred renders, and
   * wound back to the start whenever playback stops, the way a player does.
   *
   * Every stage plays the clip from the beginning, so the first part of what
   * sounds is the ground the stages below already cover and is already drawn
   * filled. This rung only starts moving once the clip has played past where
   * the one below it ended, which is what keeps the bar a single reading of how
   * far into the song the snippet has reached.
   */
  useEffect(() => {
    const node = fillRef.current;
    if (!node) return;
    if (!playing) {
      node.style.width = "0%";
      return;
    }
    const span = Math.max(current - opens, 0.0001);
    let frame = requestAnimationFrame(function tick() {
      const heard = engine.snippetProgress() * current;
      const share = Math.max(0, Math.min(1, (heard - opens) / span));
      node.style.width = `${share * 100}%`;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, engine, index, current, opens]);

  return (
    <div className="flex flex-col items-center gap-10">
      {/*
       * One bar, cut into rungs rather than built out of five. A rung is as
       * wide as its snippet is long, and the ones already reached stay filled:
       * every stage opens the clip from the beginning, so a snippet that runs
       * to 8s has sounded everything the rungs below it stand for. The fill is
       * how far into the song the round has been, read left to right.
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

        {/*
         * Never busy and never dimmed. Whether the clip has finished coming
         * down is the round's business and not something to make the player
         * watch: the button is the same button from the moment the card is,
         * and a press that lands early is held until there is audio for it.
         */}
        <button
          type="button"
          onClick={onPlay}
          aria-label={playing ? "Stop" : "Play"}
          className="orb grid h-32 w-32 shrink-0 place-items-center rounded-full"
          style={{
            backgroundColor: shade,
            color: inkOn(shade),
            boxShadow: `0 0 46px -4px color-mix(in srgb, ${shade} 70%, transparent)`,
          }}
        >
          {playing ? (
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
