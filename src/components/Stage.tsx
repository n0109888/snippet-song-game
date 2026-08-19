"use client";

interface StageProps {
  stages: number[];
  /** Highest stage the player has unlocked. */
  unlocked: number;
  playing: boolean;
  disabled: boolean;
  accent: string;
  onPlay: () => void;
}

/** Trims trailing zeros so 0.1 reads as 0.1s and 0.01 keeps both digits. */
function format(seconds: number): string {
  return `${Number(seconds.toFixed(2))}s`;
}

export default function Stage({
  stages,
  unlocked,
  playing,
  disabled,
  accent,
  onPlay,
}: StageProps) {
  const total = stages.reduce((sum, s) => sum + s, 0);
  const current = stages[Math.min(unlocked, stages.length - 1)] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex h-2 w-full gap-[2px]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stages.length}
        aria-valuenow={Math.min(unlocked + 1, stages.length)}
        aria-label="Stage"
      >
        {stages.map((length, i) => {
          const filled = i <= unlocked;
          const isCurrent = i === unlocked;
          return (
            <div
              key={`${length}-${i}`}
              style={{
                flexGrow: length / total,
                backgroundColor: filled ? accent : "var(--color-line)",
                opacity: filled && !isCurrent ? 0.45 : 1,
              }}
              className="rounded-[2px] transition-opacity duration-150 ease-out"
            />
          );
        })}
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          aria-label={playing ? "Stop" : "Play"}
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-line-strong bg-panel transition-[transform,opacity] duration-150 ease-out hover:border-[var(--color-ink)] active:scale-[0.97] disabled:opacity-40 disabled:hover:border-line-strong"
        >
          {playing ? (
            <span className="block h-5 w-5 rounded-[2px] bg-ink" />
          ) : (
            <span
              className="ml-1 block h-0 w-0 border-y-[13px] border-l-[21px] border-y-transparent"
              style={{ borderLeftColor: "var(--color-ink)" }}
            />
          )}
        </button>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-4xl leading-none tabular-nums">{format(current)}</span>
          <span className="font-mono text-xs text-faint">
            {Math.min(unlocked + 1, stages.length)}/{stages.length}
          </span>
        </div>
      </div>
    </div>
  );
}
