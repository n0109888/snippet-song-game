"use client";

import { Fragment, useEffect, useRef } from "react";
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
  const fillsRef = useRef<(HTMLDivElement | null)[]>([]);

  /**
   * The playhead, across the whole bar rather than inside one rung. Every stage
   * plays the clip from the beginning, so the bar fills from the beginning:
   * it winds back to the left edge and sweeps across the rungs already reached
   * on its way to the one being played, the way a player scrubs to zero before
   * it starts. Stopping leaves the rungs already reached filled and the current
   * one empty, which is the ground the round stands on rather than a position
   * in it.
   *
   * Written straight to the nodes on each frame, because a 15s clip would
   * otherwise be nine hundred renders.
   */
  useEffect(() => {
    const paint = (heard: number | null) => {
      let opens = 0;
      stages.forEach((length, i) => {
        const node = fillsRef.current[i];
        const span = Math.max(length - opens, 0.0001);
        if (node) {
          const share =
            heard === null
              ? i < index
                ? 1
                : 0
              : Math.max(0, Math.min(1, (heard - opens) / span));
          node.style.width = `${share * 100}%`;
        }
        opens = length;
      });
    };

    if (!playing) {
      paint(null);
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      paint(engine.snippetProgress() * current);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, engine, stages, index, current]);

  return (
    <div className="flex flex-col items-center gap-10">
      {/*
       * One bar, cut into rungs rather than built out of five. A rung is as
       * wide as its snippet is long, and the ones already reached stay filled:
       * every stage opens the clip from the beginning, so a snippet that runs
       * to 8s has sounded everything the rungs below it stand for. The fill is
       * how far into the song the round has reached, read left to right, and
       * that is where the playhead runs when the snippet is playing.
       */}
      <div
        // Rounded and clipped here rather than on the rungs, so the two outer
        // ends are the only round ones and everything between them is one
        // unbroken run.
        className="flex w-full items-center overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-valuenow={index + 1}
        aria-label="Stage"
      >
        {stages.map((length, i) => {
          const colour = tone ?? tierFor(length).color;
          const reached = i <= index;
          return (
            <Fragment key={`${length}-${i}`}>
              {/* Where one rung ends, drawn as the card showing through rather
                  than as a space between two bars. */}
              {i > 0 ? <div className="h-3 w-[2px] shrink-0 bg-bg" /> : null}
              <div
                // Grow in proportion, from a zero basis, so the row still fills
                // the card whatever mix of lengths is selected.
                style={{
                  flex: `${lengthShare(length, longest)} 0 0%`,
                  minWidth: "6px",
                  // What is behind the playhead: ground the round has reached,
                  // or track it has not.
                  backgroundColor: reached
                    ? `color-mix(in srgb, ${colour} 22%, transparent)`
                    : "var(--color-line-strong)",
                }}
                className="h-3"
              >
                {/* Every rung carries one, because the playhead crosses them
                    all on its way out from the left. */}
                <div
                  ref={(node) => {
                    fillsRef.current[i] = node;
                  }}
                  className="h-full w-0"
                  style={{ backgroundColor: colour }}
                />
              </div>
            </Fragment>
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
