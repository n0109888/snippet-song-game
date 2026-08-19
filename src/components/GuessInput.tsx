"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalize } from "@/lib/normalize";
import type { Track } from "@/lib/types";

interface GuessInputProps {
  tracks: Track[];
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
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="Title"
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
            className="h-11 w-full rounded-control border border-line bg-panel px-3 text-[15px] text-ink placeholder:text-faint focus:border-line-strong disabled:opacity-40"
          />

          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute bottom-[calc(100%+4px)] left-0 z-20 w-full overflow-hidden rounded-control border border-line bg-panel"
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
                    <span className="truncate">{s.track.title}</span>
                    {s.ambiguous ? (
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
          className="h-11 shrink-0 rounded-control border border-line px-4 text-sm text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          Skip
        </button>
      </div>

      <span className="font-mono text-xs text-faint">
        {remaining <= 1 ? "Last guess" : `${remaining} guesses left`}
      </span>
    </div>
  );
}
