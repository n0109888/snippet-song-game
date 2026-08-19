import { NextResponse } from "next/server";
import { RateLimited, TtlCache, fetchRetry } from "@/lib/server-cache";
import type { ApiError, PlaylistResponse, RawTrack } from "@/lib/types";

/**
 * Playlist fetching for both sources.
 *
 * Spotify, as of the February 2026 Web API changes: GET /playlists/{id}/items
 * returns contents only for playlists the user owns or collaborates on and
 * answers 403 otherwise. The response fields were renamed, tracks.tracks.track
 * became items.items.item, so both shapes are read defensively.
 */

const MAX_TRACKS = 200;
const PAGE = 50;

const deezerCache = new TtlCache<PlaylistResponse>(10 * 60 * 1000);

const fail = (code: ApiError["code"], error: string, status: number, retryAfter?: number) =>
  NextResponse.json<ApiError>({ code, error, retryAfter }, { status });

interface SpotifyArtist {
  name?: string;
}
interface SpotifyImage {
  url?: string;
}
interface SpotifyTrack {
  id?: string;
  name?: string;
  type?: string;
  artists?: SpotifyArtist[];
  album?: { images?: SpotifyImage[] };
  external_urls?: { spotify?: string };
}
interface SpotifyItem {
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
}
interface SpotifyPage {
  items?: SpotifyItem[];
  next?: string | null;
  total?: number;
}
interface SpotifyPlaylist {
  name?: string;
  items?: SpotifyPage;
  tracks?: SpotifyPage;
}

function toRawTrack(track: SpotifyTrack): RawTrack | null {
  if (!track.id || !track.name) return null;
  if (track.type && track.type !== "track") return null;
  const artist = (track.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  if (!artist) return null;
  return {
    id: `spotify:${track.id}`,
    title: track.name,
    artist,
    art: track.album?.images?.[0]?.url ?? null,
    link: track.external_urls?.spotify ?? null,
    rank: null,
  };
}

async function spotify(id: string, auth: string): Promise<NextResponse> {
  const headers = { authorization: auth };

  const metaRes = await fetchRetry(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`,
    { headers, cache: "no-store" },
  );

  if (metaRes.status === 401) return fail("unauthorized", "Session expired. Sign in again.", 401);
  if (metaRes.status === 404) return fail("not_found", "That playlist does not exist.", 404);
  if (!metaRes.ok && metaRes.status !== 403) {
    return fail("upstream", "Spotify is not responding.", 502);
  }

  const meta = (await metaRes.json().catch(() => ({}))) as SpotifyPlaylist;
  const name = meta.name ?? "Playlist";

  const tracks: RawTrack[] = [];
  const seen = new Set<string>();
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/items?limit=${PAGE}`;

  while (url && tracks.length < MAX_TRACKS) {
    const res: Response = await fetchRetry(url, { headers, cache: "no-store" });

    if (res.status === 403) {
      return fail(
        "not_owned",
        "Spotify only lets apps read playlists you own or collaborate on. Copy it to your account, or use one of the options below.",
        403,
      );
    }
    if (res.status === 401) return fail("unauthorized", "Session expired. Sign in again.", 401);
    if (!res.ok) return fail("upstream", "Spotify is not responding.", 502);

    const page = (await res.json().catch(() => ({}))) as SpotifyPage;
    const items = page.items ?? [];
    if (items.length === 0) break;

    for (const entry of items) {
      const track = entry.item ?? entry.track;
      if (!track) continue;
      const raw = toRawTrack(track);
      if (raw && !seen.has(raw.id)) {
        seen.add(raw.id);
        tracks.push(raw);
      }
      if (tracks.length >= MAX_TRACKS) break;
    }

    url = page.next ?? null;
  }

  if (tracks.length === 0) {
    return fail("empty", "That playlist has no playable tracks.", 422);
  }

  return NextResponse.json<PlaylistResponse>({
    name,
    tracks,
    truncated: tracks.length >= MAX_TRACKS,
  });
}

interface DeezerTrack {
  id?: number;
  rank?: number;
  title?: string;
  title_short?: string;
  preview?: string;
  readable?: boolean;
  type?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
  link?: string;
}

async function deezer(id: string): Promise<NextResponse> {
  const cached = deezerCache.get(id);
  if (cached) return NextResponse.json(cached);

  const metaRes = await fetchRetry(`https://api.deezer.com/playlist/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!metaRes.ok) return fail("upstream", "Deezer is not responding.", 502);

  const meta = (await metaRes.json().catch(() => ({}))) as {
    title?: string;
    error?: { message?: string };
  };
  if (meta.error) return fail("not_found", "That playlist is private or does not exist.", 404);

  const tracks: RawTrack[] = [];
  const seen = new Set<string>();
  let index = 0;

  while (tracks.length < MAX_TRACKS) {
    const res = await fetchRetry(
      `https://api.deezer.com/playlist/${encodeURIComponent(id)}/tracks?limit=${PAGE}&index=${index}`,
      { cache: "no-store" },
    );
    if (!res.ok) return fail("upstream", "Deezer is not responding.", 502);

    const page = (await res.json().catch(() => ({}))) as { data?: DeezerTrack[]; next?: string };
    const data = page.data ?? [];
    if (data.length === 0) break;

    for (const t of data) {
      if (!t.id || !t.title || !t.artist?.name || !t.preview) continue;
      if (t.readable === false) continue;
      const key = `deezer:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push({
        id: key,
        title: t.title_short ?? t.title,
        artist: t.artist.name,
        art: t.album?.cover_medium ?? t.album?.cover_big ?? null,
        link: t.link ?? null,
        preview: t.preview,
        rank: typeof t.rank === "number" ? t.rank : null,
      });
      if (tracks.length >= MAX_TRACKS) break;
    }

    if (!page.next) break;
    index += PAGE;
  }

  if (tracks.length === 0) return fail("empty", "That playlist has no playable tracks.", 422);

  const payload: PlaylistResponse = {
    name: meta.title ?? "Playlist",
    tracks,
    truncated: tracks.length >= MAX_TRACKS,
  };
  deezerCache.set(id, payload);
  return NextResponse.json(payload);
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const id = searchParams.get("id");

  if (!id) return fail("bad_link", "That link is not a playlist.", 400);

  try {
    if (source === "deezer") return await deezer(id);

    if (source === "spotify") {
      const auth = request.headers.get("authorization");
      if (!auth) return fail("unauthorized", "Sign in to read a Spotify playlist.", 401);
      return await spotify(id, auth);
    }

    return fail("bad_link", "That link is not a playlist.", 400);
  } catch (err) {
    if (err instanceof RateLimited) {
      return fail("rate_limited", `Rate limited. Try again in ${err.retryAfter}s.`, 429, err.retryAfter);
    }
    return fail("upstream", "Could not reach that service.", 502);
  }
}
