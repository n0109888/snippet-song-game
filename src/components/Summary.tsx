"use client";

import { useState } from "react";
import type { Track } from "@/lib/types";

export interface RoundResult {
  track: Track;
  /** Stage the track was solved at, or null when it was missed. */
  solvedAt: number | null;
}

interface SummaryProps {
  results: RoundResult[];
  score: number;
  stageCount: number;
  onAgain: () => void;
  onExit: () => void;
}

function textReport(results: RoundResult[], stageCount: number, score: number): string {
  const lines = results.map((r) => {
    const cells = Array.from({ length: stageCount }, (_, i) => {
      if (r.solvedAt === null) return ".";
      return i === r.solvedAt ? "#" : i < r.solvedAt ? "x" : ".";
    });
    return cells.join("");
  });
  return `Snippet ${score}\n${lines.join("\n")}`;
}

export default function Summary({ results, score, stageCount, onAgain, onExit }: SummaryProps) {
  const [copied, setCopied] = useState(false);
  const solved = results.filter((r) => r.solvedAt !== null).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(textReport(results, stageCount, score));
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
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Score</span>
          <span className="font-mono text-2xl leading-none tabular-nums">{score}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Got</span>
          <span className="font-mono text-2xl leading-none tabular-nums">
            {solved}/{results.length}
          </span>
        </div>
      </div>

      <ul className="flex max-h-[46dvh] flex-col gap-2 overflow-y-auto">
        {results.map((r) => (
          <li key={r.track.id} className="flex items-center gap-3">
            <div className="flex shrink-0 gap-[2px]">
              {Array.from({ length: stageCount }, (_, i) => {
                const hit = r.solvedAt !== null && i === r.solvedAt;
                const used = r.solvedAt !== null && i < r.solvedAt;
                return (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-[2px]"
                    style={{
                      backgroundColor: hit
                        ? "var(--color-accent)"
                        : used
                          ? "var(--color-line-strong)"
                          : "var(--color-line)",
                    }}
                  />
                );
              })}
            </div>
            <span className="truncate text-sm">
              <span className={r.solvedAt === null ? "text-muted" : ""}>{r.track.title}</span>
              <span className="text-faint"> {r.track.artist}</span>
            </span>
          </li>
        ))}
      </ul>

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
