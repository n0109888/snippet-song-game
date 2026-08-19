"use client";

import { tierFor } from "@/lib/round";

interface StageProps {
  stages: number[];
  /** Highest stage the player has unlocked. */
  unlocked: number;
  playing: boolean;
  disabled: boolean;
  loading?: boolean;
  onPlay: () => void;
}

function format(seconds: number): string {
  return `${Number(seconds.toFixed(2))}s`;
}

export default function Stage({
  stages,
  unlocked,
  playing,
  disabled,
  loading = false,
  onPlay,
}: StageProps) {
  const index = Math.min(unlocked, stages.length - 1);
  const current = stages[index] ?? 0;
  const tier = tierFor(current);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* One segment per difficulty, in its own colour. */}
      <div
        className="flex w-full gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-valuenow={index + 1}
        aria-label="Difficulty"
      >
        {stages.map((length, i) => {
          const t = tierFor(length);
          const reached = i <= index;
          return (
            <div
              key={`${length}-${i}`}
              className="h-2 flex-1 rounded-full transition-opacity duration-150 ease-out"
              style={{
                backgroundColor: reached ? t.color : "var(--color-line)",
                opacity: reached ? (i === index ? 1 : 0.35) : 1,
              }}
            />
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
        <span className="font-mono text-5xl leading-tight tabular-nums">{format(current)}</span>
      </div>

      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        aria-label={playing ? "Stop" : "Play"}
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[3px] bg-panel transition-transform duration-150 ease-out hover:scale-[1.05] active:scale-[0.96] disabled:opacity-40"
        style={{ borderColor: tier.color }}
      >
        {loading ? (
          <span
            className="block h-6 w-6 animate-pulse rounded-full"
            style={{ backgroundColor: tier.color }}
          />
        ) : playing ? (
          <span className="block h-6 w-6 rounded-[3px]" style={{ backgroundColor: tier.color }} />
        ) : (
          <span
            className="ml-1.5 block h-0 w-0 border-y-[17px] border-l-[27px] border-y-transparent"
            style={{ borderLeftColor: tier.color }}
          />
        )}
      </button>
    </div>
  );
}
