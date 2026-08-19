"use client";

import Image from "next/image";
import type { PresetCollection } from "@/lib/types";

interface PresetPickerProps {
  collections: PresetCollection[];
  busy: string | null;
  onStart: (collection: PresetCollection) => void;
}

export default function PresetPicker({ collections, busy, onStart }: PresetPickerProps) {
  if (collections.length === 0) {
    return <span className="text-sm text-muted">No songs</span>;
  }

  return (
    <div className="press-in flex flex-wrap items-start justify-center gap-5">
      {collections.map((collection) => {
        const loading = busy === collection.id;
        return (
          <button
            key={collection.id}
            type="button"
            disabled={busy !== null}
            onClick={() => onStart(collection)}
            className="group relative flex w-64 flex-col overflow-hidden rounded-panel border border-line bg-panel text-left transition-[transform,border-color] duration-150 ease-out hover:border-line-strong active:scale-[0.985] disabled:opacity-60"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-raised">
              {collection.image ? (
                <Image
                  src={collection.image}
                  alt=""
                  width={512}
                  height={512}
                  unoptimized
                  priority
                  className="h-full w-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.03]"
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col">
                <span className="text-base leading-tight">{collection.name}</span>
                <span className="font-mono text-[11px] text-faint">
                  {collection.tracks.length} songs
                </span>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint transition-colors duration-150 ease-out group-hover:text-accent">
                {loading ? "..." : "Play"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
