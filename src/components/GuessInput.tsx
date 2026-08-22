"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalize } from "@/lib/normalize";
import type { Track } from "@/lib/types";

interface GuessInputProps {
  tracks: Track[];
  /** Mixed-artist packs name the artist on every row, one title is not enough. */
  showArtist: boolean;
  disabled: boolean;
  onGuess: (value: string) => void;
  onSkip: () => void;
  remaining: number;
}

const MAX_SUGGESTIONS = 6;

export interface Suggestion {
  track: Track;
  /** Artist is shown when another loaded track has the same title. */
  ambiguous: boolean;
}

export default function GuessInput({
  tracks,
  showArtist,
  disabled,
  onGuess,
  onSkip,
  remaining,
}: GuessInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Titles that appear more than once, so the dropdown can disambiguate them.
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      const key = normalize(t.title);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tracks]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = normalize(value);
    if (!query) return [];
    const starts: Track[] = [];
    const contains: Track[] = [];

    for (const track of tracks) {
      const title = normalize(track.title);
      const artist = normalize(track.artist);
      if (title.startsWith(query)) starts.push(track);
      else if (title.includes(query) || artist.includes(query)) contains.push(track);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }

    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS).map((track) => ({
      track,
      ambiguous: (duplicates.get(normalize(track.title)) ?? 0) > 1,
    }));
  }, [value, tracks, duplicates]);

  useEffect(() => {
    setActive(-1);
  }, [value]);

  // The parent clears the field by disabling the input between tracks.
  useEffect(() => {
    if (disabled) {
      setValue("");
      setOpen(false);
    }
  }, [disabled]);

  function submit(explicit?: string) {
    const picked = explicit ?? suggestions[active >= 0 ? active : 0]?.track.title ?? value;
    if (!picked.trim()) return;
    onGuess(picked);
    setValue("");
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2.5">
        <div className="relative flex-1">
          {/* Inside the field rather than beside it, so the round row reads as
              one search box the way the rest of the card reads as one bar. */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint"
          >
            <circle cx="11" cy="11" r="6.4" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder={showArtist ? "Search songs or artists…" : "Search songs…"}
            aria-label="Guess"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            role="combobox"
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            className="h-12 w-full rounded-full border border-line bg-panel pl-11 pr-4 text-[15px] text-ink placeholder:text-faint focus:border-line-strong disabled:opacity-40"
          />

          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-full overflow-hidden rounded-panel border border-line bg-panel"
            >
              {suggestions.map((s, i) => (
                <li key={s.track.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      submit(s.track.title);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition-colors duration-120 ease-out ${
                      i === active ? "bg-[rgba(255,255,255,0.06)]" : ""
                    }`}
                  >
                    {/* A fixed column, so a list of many artists still reads down. */}
                    {showArtist ? (
                      <span className="w-[38%] shrink-0 truncate text-xs text-faint">
                        {s.track.artist}
                      </span>
                    ) : null}
                    <span className="truncate">{s.track.title}</span>
                    {!showArtist && s.ambiguous ? (
                      <span className="shrink-0 text-xs text-faint">{s.track.artist}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="pill flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-line bg-panel px-6 text-[15px] font-bold text-ink hover:border-line-strong disabled:opacity-40"
        >
          {/* The media skip glyph: jump to the next one. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            aria-hidden
            className="h-[18px] w-[18px]"
          >
            <path d="M6 5.4 16.4 12 6 18.6z" />
            <path d="M19 5v14" strokeLinecap="round" />
          </svg>
          Skip
        </button>
      </div>

      <span className="px-1 font-mono text-xs text-faint">
        {remaining <= 1 ? "Last guess" : `${remaining} guesses left`}
      </span>
    </div>
  );
}
