"use client";

import { useState } from "react";

interface SourcePickerProps {
  busy: boolean;
  signedIn: boolean;
  error: string | null;
  notice: string | null;
  onLoadLink: (value: string) => void;
  onLoadPasted: (text: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export default function SourcePicker({
  busy,
  signedIn,
  error,
  notice,
  onLoadLink,
  onLoadPasted,
  onSignIn,
  onSignOut,
}: SourcePickerProps) {
  const [link, setLink] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

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

      <div className="flex items-center gap-4 text-xs text-faint">
        <button
          type="button"
          onClick={() => setPasting((p) => !p)}
          className="transition-colors duration-150 ease-out hover:text-muted"
        >
          Paste a list
        </button>
        {signedIn ? (
          <button
            type="button"
            onClick={onSignOut}
            className="transition-colors duration-150 ease-out hover:text-muted"
          >
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="transition-colors duration-150 ease-out hover:text-muted"
          >
            Spotify sign in
          </button>
        )}
      </div>

      {pasting ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            disabled={busy}
            rows={5}
            spellCheck={false}
            placeholder={"Artist - Title\nArtist - Title"}
            aria-label="Track list"
            className="w-full resize-none rounded-control border border-line bg-panel p-3 font-mono text-[13px] text-ink placeholder:text-faint focus:border-line-strong disabled:opacity-40"
          />
          <button
            type="button"
            disabled={busy || !pasted.trim()}
            onClick={() => onLoadPasted(pasted)}
            className="h-9 self-start rounded-control border border-line-strong px-4 text-sm transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
          >
            Load
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--color-bad)]">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
    </div>
  );
}
