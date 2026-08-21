"use client";

import { useState } from "react";
import { formatSeconds, tierFor } from "@/lib/round";
import type { Track } from "@/lib/types";

export interface RoundResult {
  track: Track;
  /** Stage the track was solved at, or null when it was missed. */
  solvedAt: number | null;
  /** Snippet length the track was played at, which names its level. */
  length: number;
}

interface SummaryProps {
  results: RoundResult[];
  stageCount: number;
  /** Guessable gives each song one level and one guess, so there is no ladder. */
  guessable: boolean;
  onAgain: () => void;
  onExit: () => void;
}

function textReport(results: RoundResult[], stageCount: number, guessable: boolean): string {
  if (guessable) {
    const lines = results.map(
      (r) =>
        `${tierFor(r.length).name.padEnd(10)} ${formatSeconds(r.length).padStart(6)}  ${
          r.solvedAt === null ? "." : "#"
        }`,
    );
    return `Snippet\n${lines.join("\n")}`;
  }
  const lines = results.map((r) => {
    const cells = Array.from({ length: stageCount }, (_, i) => {
      if (r.solvedAt === null) return ".";
      return i === r.solvedAt ? "#" : i < r.solvedAt ? "x" : ".";
    });
    return cells.join("");
  });
  return `Snippet\n${lines.join("\n")}`;
}

/** Shared by the end of round screen and the mid round results panel. */
export function ResultsList({
  results,
  stageCount,
  guessable = false,
}: {
  results: RoundResult[];
  stageCount: number;
  guessable?: boolean;
}) {
  if (results.length === 0) {
    return <p className="text-sm text-faint">Nothing yet</p>;
  }
  return (
    <ul className="no-bars flex max-h-[52dvh] flex-col gap-2 overflow-y-auto">
      {results.map((r, i) => (
        <li key={`${r.track.id}-${i}`} className="flex items-center gap-3">
          {guessable ? (
            // The level carries the length, so it stands in for the ladder of
            // pips a classic round leaves behind.
            <span
              className="w-[72px] shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{
                color: r.solvedAt === null ? "var(--color-faint)" : tierFor(r.length).color,
              }}
            >
              {tierFor(r.length).name}
            </span>
          ) : (
            <div className="flex shrink-0 gap-[2px]">
              {Array.from({ length: stageCount }, (_, s) => {
                const hit = r.solvedAt !== null && s === r.solvedAt;
                const used = r.solvedAt !== null && s < r.solvedAt;
                return (
                  <span
                    key={s}
                    className="h-3 w-3 rounded-[2px]"
                    style={{
                      backgroundColor: hit
                        ? "var(--color-good)"
                        : used
                          ? "var(--color-line-strong)"
                          : "var(--color-line)",
                    }}
                  />
                );
              })}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className={r.solvedAt === null ? "text-muted" : ""}>{r.track.title}</span>
            <span className="text-faint"> {r.track.artist}</span>
          </span>
          <span
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: r.solvedAt === null ? "var(--color-bad)" : "var(--color-good)" }}
          >
            {r.solvedAt === null ? "Missed" : "Got it"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Summary({
  results,
  stageCount,
  guessable,
  onAgain,
  onExit,
}: SummaryProps) {
  const [copied, setCopied] = useState(false);
  const solved = results.filter((r) => r.solvedAt !== null).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(textReport(results, stageCount, guessable));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            Correct
          </span>
          <span className="font-mono text-2xl leading-none tabular-nums">
            {solved}/{results.length}
          </span>
        </div>
      </div>

      <ResultsList results={results} stageCount={stageCount} guessable={guessable} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="h-10 rounded-control border border-line-strong px-4 text-sm transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)]"
        >
          Again
        </button>
        <button
          type="button"
          onClick={onExit}
          className="h-10 rounded-control border border-line px-4 text-sm text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink"
        >
          Change
        </button>
        <button
          type="button"
          onClick={copy}
          className="h-10 rounded-control border border-line px-4 text-sm text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink"
        >
          {copied ? "Copied" : "Copy result"}
        </button>
      </div>
    </div>
  );
}
