import { NextResponse } from "next/server";
import { isSameRecording } from "@/lib/normalize";
import { RateLimited, TtlCache, fetchRetry, mapLimit } from "@/lib/server-cache";
import type { ApiError, RawTrack } from "@/lib/types";

/**
 * Resolves a 30 second preview for tracks that arrive without one. Deezer is
 * tried first because one call returns both the preview and the popularity
 * rank that difficulty selection needs, with iTunes covering the rest. Every
 * candidate is checked against the requested artist and title, because an
 * unverified search result is often a different song, which makes the round
 * unwinnable.
 *
 * Deezer's field operators are strict: artist:"X" track:"Y" misses when the
 * catalogue title carries a suffix such as (Radio Edit), so a plain query runs
 * as a second attempt and the same verification decides both.
 */

const CONCURRENCY = 6;
interface Resolved {
  preview: string | null;
  art: string | null;
  rank: number | null;
}

const previewCache = new TtlCache<Resolved>(6 * 60 * 60 * 1000);

/**
 * Deezer signs its preview URLs and they last 15 minutes, measured. Caching one
 * for longer hands out a dead link, which is why playback used to fail after a
 * while. iTunes URLs carry no signature and keep working, so they cache long.
 */
function ttlFor(preview: string | null): number {
  if (preview && /[?&]hdnea=|exp=\d+/.test(preview)) return 10 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

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
  rank?: number;
  artist?: { name?: string };
  album?: { cover_medium?: string };
}

async function fromItunes(track: RawTrack): Promise<Resolved | null> {
  const term = `${track.artist} ${track.title}`.replace(/\s+/g, " ").trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`;

  const res = await fetchRetry(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as { results?: ItunesResult[] };
  for (const r of data.results ?? []) {
    if (!r.previewUrl || !r.trackName || !r.artistName) continue;
    if (isSameRecording({ title: r.trackName, artist: r.artistName }, track)) {
      // Ask for a larger square than the 100px the search returns.
      const art = r.artworkUrl100?.replace("100x100bb", "512x512bb") ?? null;
      return { preview: r.previewUrl, art, rank: null };
    }
  }
  return null;
}

async function deezerQuery(query: string, track: RawTrack): Promise<Resolved | null> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetchRetry(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as { data?: DeezerResult[] };
  for (const r of data.data ?? []) {
    const title = r.title_short ?? r.title;
    if (!r.preview || !title || !r.artist?.name) continue;
    if (isSameRecording({ title, artist: r.artist.name }, track)) {
      return {
        preview: r.preview,
        art: r.album?.cover_medium ?? null,
        rank: typeof r.rank === "number" ? r.rank : null,
      };
    }
  }
  return null;
}

async function fromDeezer(track: RawTrack): Promise<Resolved | null> {
  const strict = await deezerQuery(
    `artist:"${track.artist.replace(/"/g, "")}" track:"${track.title.replace(/"/g, "")}"`,
    track,
  );
  if (strict) return strict;
  return deezerQuery(`${track.artist} ${track.title}`, track);
}

async function resolve(track: RawTrack, refresh: boolean): Promise<Resolved> {
  if (track.preview && !refresh) {
    return { preview: track.preview, art: track.art, rank: track.rank ?? null };
  }

  const key = track.id;
  if (!refresh) {
    const cached = previewCache.get(key);
    if (cached !== undefined) return cached;
  }

  let found: Resolved | null = null;
  try {
    found = await fromDeezer(track);
    if (!found) found = await fromItunes(track);
  } catch (err) {
    if (err instanceof RateLimited) throw err;
    found = null;
  }

  const result: Resolved = found ?? { preview: null, art: null, rank: null };
  previewCache.set(key, result, ttlFor(result.preview));
  return result;
}

interface Body {
  tracks?: RawTrack[];
  /** Skip the cache, used when a stored URL has expired mid round. */
  refresh?: boolean;
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
    const previews = await mapLimit(tracks, CONCURRENCY, (t) => resolve(t, body.refresh === true));
    const resolved = tracks
      .map((track, i) => ({ track, found: previews[i] }))
      .filter(
        (r): r is { track: RawTrack; found: Resolved & { preview: string } } =>
          r.found !== undefined && r.found.preview !== null,
      )
      // The lookup often knows the cover art for a track that arrived without one.
      .map(({ track, found }) => ({
        ...track,
        preview: found.preview,
        art: track.art ?? found.art,
        rank: track.rank ?? found.rank,
      }));

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
