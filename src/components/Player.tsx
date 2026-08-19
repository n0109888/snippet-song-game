"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioEngine } from "@/lib/audio";

interface PlayerProps {
  engine: AudioEngine;
  trackId: string;
  /** Needed because the clip may never have been decoded, if the track was skipped. */
  previewUrl: string | null;
  /** Starts playing on mount, so the clip continues straight after the reveal. */
  autoPlay: boolean;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Player({ engine, trackId, previewUrl, autoPlay }: PlayerProps) {
  const [duration, setDuration] = useState(engine.duration(trackId));
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const frame = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const track = useCallback(() => {
    const step = () => {
      setPosition(Math.min(engine.position(), duration));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [engine, duration]);

  const halt = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const start = useCallback(
    (from: number) => {
      engine.playFull(trackId, from, () => {
        setPlaying(false);
        halt();
        setPosition(duration);
      });
      setPlaying(true);
      track();
    },
    [engine, trackId, duration, halt, track],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (!engine.has(trackId)) {
          if (!previewUrl) throw new Error("no preview");
          await engine.load(trackId, previewUrl);
        }
        if (cancelled) return;
        setDuration(engine.duration(trackId));
        if (autoPlay) start(0);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      halt();
      engine.stopFull();
    };
    // Runs once for the track this player was mounted for.
  }, [autoPlay, start, halt, engine, trackId, previewUrl]);

  function toggle() {
    if (failed || duration <= 0) return;
    if (playing) {
      engine.stopFull();
      setPlaying(false);
      halt();
    } else {
      start(position >= duration - 0.05 ? 0 : position);
    }
  }

  function seekTo(clientX: number) {
    const bar = barRef.current;
    if (!bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = ratio * duration;
    setPosition(next);
    if (playing) start(next);
  }

  const pct = duration > 0 ? (position / duration) * 100 : 0;

  if (failed) return null;

  return (
    <div className="flex w-full max-w-sm items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={duration <= 0}
        aria-label={playing ? "Pause" : "Play"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong transition-colors duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] disabled:opacity-40"
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="block h-3 w-[3px] bg-ink" />
            <span className="block h-3 w-[3px] bg-ink" />
          </span>
        ) : (
          <span
            className="ml-[2px] block h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent"
            style={{ borderLeftColor: "var(--color-ink)" }}
          />
        )}
      </button>

      <span className="font-mono text-[11px] tabular-nums text-faint">{clock(position)}</span>

      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        onMouseDown={(e) => seekTo(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seekTo(Number.POSITIVE_INFINITY);
          if (e.key === "ArrowLeft") seekTo(Number.NEGATIVE_INFINITY);
        }}
        className="group relative h-6 flex-1 cursor-pointer"
      >
        <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>

      <span className="font-mono text-[11px] tabular-nums text-faint">{clock(duration)}</span>
    </div>
  );
}
