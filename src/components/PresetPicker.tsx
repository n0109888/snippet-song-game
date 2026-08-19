"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { normalize } from "@/lib/normalize";
import type { PresetCollection } from "@/lib/types";

interface PresetPickerProps {
  collections: PresetCollection[];
  busy: string | null;
  onStart: (collection: PresetCollection) => void;
}

export default function PresetPicker({ collections, busy, onStart }: PresetPickerProps) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = normalize(query);
    if (!q) return collections;
    return collections.filter((c) => normalize(c.name).includes(q));
  }, [collections, query]);

  if (collections.length === 0) {
    return <span className="text-sm text-muted">No songs</span>;
  }

  return (
    <div className="flex h-full w-full max-w-3xl flex-col gap-5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search artists"
        aria-label="Search artists"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full shrink-0 rounded-control border border-line bg-panel px-3 text-sm text-ink placeholder:text-faint focus:border-line-strong"
      />

      {shown.length === 0 ? (
        <span className="text-sm text-faint">No match</span>
      ) : (
        <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-2 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((collection, i) => (
            <button
              key={collection.id}
              type="button"
              disabled={busy !== null}
              onClick={() => onStart(collection)}
              aria-label={`Play ${collection.name}`}
              className="pack group flex flex-col overflow-hidden rounded-panel border border-line bg-panel text-left disabled:opacity-60"
            >
              <div className="aspect-square w-full overflow-hidden bg-raised">
                {collection.image ? (
                  <Image
                    src={collection.image}
                    alt=""
                    width={320}
                    height={320}
                    unoptimized
                    priority={i < 4}
                    className="pack-art h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex flex-col px-3 py-2.5">
                <span className="truncate text-sm leading-tight">{collection.name}</span>
                <span className="font-mono text-[10px] text-faint">
                  {busy === collection.id ? "Loading" : `${collection.tracks.length} songs`}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
