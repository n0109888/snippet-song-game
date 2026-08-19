export type SourceKind = "preset" | "spotify" | "deezer" | "paste";

export type StartMode = "start" | "dropin";

/** One playable track. `preview` is always a 30 second preview, never a full track. */
export interface Track {
  id: string;
  title: string;
  artist: string;
  art: string | null;
  /** Resolved lazily, so a large playlist loads without waiting on lookups. */
  preview: string | null;
  link: string | null;
  /** Deezer popularity, 0 to 1000000, higher is better known. Null when unknown. */
  rank: number | null;
}

/** A track before preview resolution. */
export interface RawTrack {
  id: string;
  title: string;
  artist: string;
  art: string | null;
  link: string | null;
  preview?: string | null;
  rank?: number | null;
}

export interface LoadedPlaylist {
  name: string;
  source: SourceKind;
  sourceId: string;
  tracks: Track[];
}

/** A preset pack. Genres or artists can be added by editing the JSON. */
export interface PresetCollection {
  id: string;
  name: string;
  note: string;
  image: string | null;
  tracks: Track[];
}

export interface PlaylistResponse {
  name: string;
  tracks: RawTrack[];
  truncated: boolean;
}

export interface ApiError {
  error: string;
  code:
    | "not_owned"
    | "not_found"
    | "empty"
    | "unauthorized"
    | "rate_limited"
    | "bad_link"
    | "upstream"
    | "no_previews";
  retryAfter?: number;
}

export const isApiError = (v: unknown): v is ApiError =>
  typeof v === "object" && v !== null && "code" in v && "error" in v;
