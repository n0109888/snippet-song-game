import { NextResponse } from "next/server";
import { isSameRecording } from "@/lib/normalize";
import { RateLimited, TtlCache, fetchRetry, mapLimit } from "@/lib/server-cache";
import type { ApiError, RawTrack } from "@/lib/types";

/**
 * Resolves a 30 second preview for tracks that arrive without one, by
 * searching iTunes first and then Deezer. Every candidate is checked against
 * the requested artist and title, because an unverified search result is often
 * a different song, which makes the round unwinnable.
 *
 * Deezer's field operators are strict: artist:"X" track:"Y" misses when the
 * catalogue title carries a suffix such as (Radio Edit), so a plain query runs
 * as a second attempt and the same verification decides both.
 */

const CONCURRENCY = 6;
const previewCache = new TtlCache<string | null>(6 * 60 * 60 * 1000);

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface DeezerResult {
  title?: string;
  title_short?: string;
  preview?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string };
}

async function fromItunes(track: RawTrack): Promise<string | null> {
  const term = `${track.artist} ${track.title}`.replace(/\s+/g, " ").trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`;

  const res = await fetchRetry(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as { results?: ItunesResult[] };
  for (const r of data.results ?? []) {
    if (!r.previewUrl || !r.trackName || !r.artistName) continue;
    if (isSameRecording({ title: r.trackName, artist: r.artistName }, track)) {
      return r.previewUrl;
    }
  }
  return null;
}

async function deezerQuery(query: string, track: RawTrack): Promise<string | null> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetchRetry(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as { data?: DeezerResult[] };
  for (const r of data.data ?? []) {
    const title = r.title_short ?? r.title;
    if (!r.preview || !title || !r.artist?.name) continue;
    if (isSameRecording({ title, artist: r.artist.name }, track)) return r.preview;
  }
  return null;
}

async function fromDeezer(track: RawTrack): Promise<string | null> {
  const strict = await deezerQuery(
    `artist:"${track.artist.replace(/"/g, "")}" track:"${track.title.replace(/"/g, "")}"`,
    track,
  );
  if (strict) return strict;
  return deezerQuery(`${track.artist} ${track.title}`, track);
}

async function resolve(track: RawTrack): Promise<string | null> {
  if (track.preview) return track.preview;

  const key = track.id;
  const cached = previewCache.get(key);
  if (cached !== undefined) return cached;

  let found: string | null = null;
  try {
    found = await fromItunes(track);
    if (!found) found = await fromDeezer(track);
  } catch (err) {
    if (err instanceof RateLimited) throw err;
    found = null;
  }

  previewCache.set(key, found);
  return found;
}

interface Body {
  tracks?: RawTrack[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json<ApiError>(
      { code: "bad_link", error: "Bad request." },
      { status: 400 },
    );
  }

  const tracks = (body.tracks ?? []).filter(
    (t): t is RawTrack => Boolean(t && t.id && t.title && t.artist),
  );
  if (tracks.length === 0) {
    return NextResponse.json<ApiError>(
      { code: "empty", error: "Nothing to resolve." },
      { status: 400 },
    );
  }

  try {
    const previews = await mapLimit(tracks, CONCURRENCY, (t) => resolve(t));
    const resolved = tracks
      .map((track, i) => ({ track, preview: previews[i] ?? null }))
      .filter((r): r is { track: RawTrack; preview: string } => r.preview !== null)
      .map(({ track, preview }) => ({ ...track, preview }));

    return NextResponse.json({
      tracks: resolved,
      skipped: tracks.length - resolved.length,
    });
  } catch (err) {
    if (err instanceof RateLimited) {
      return NextResponse.json<ApiError>(
        {
          code: "rate_limited",
          error: `Rate limited. Try again in ${err.retryAfter}s.`,
          retryAfter: err.retryAfter,
        },
        { status: 429 },
      );
    }
    return NextResponse.json<ApiError>(
      { code: "upstream", error: "Preview lookup failed." },
      { status: 502 },
    );
  }
}
