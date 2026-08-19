"use client";

import { useState } from "react";

interface SourcePickerProps {
  busy: boolean;
  error: string | null;
  onLoadLink: (value: string) => void;
}

export default function SourcePicker({ busy, error, onLoadLink }: SourcePickerProps) {
  const [link, setLink] = useState("");

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <form
        className="flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onLoadLink(link);
        }}
      >
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          placeholder="Spotify or Deezer playlist link"
          aria-label="Playlist link"
          className="h-11 flex-1 rounded-control border border-line bg-panel px-3 text-[15px] text-ink placeholder:text-faint focus:border-line-strong disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={busy || !link.trim()}
          className="h-11 shrink-0 rounded-control border border-line-strong px-4 text-sm transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
        >
          Load
        </button>
      </form>

      <p className="text-xs text-faint">
        Any public playlist. No account needed for either service.
      </p>

      {error ? <p className="text-sm text-[var(--color-bad)]">{error}</p> : null}
    </div>
  );
}
