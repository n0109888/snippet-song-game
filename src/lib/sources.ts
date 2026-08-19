"use client";

import { isSameRecording } from "./normalize";
import type { RawTrack, Track } from "./types";

/**
 * Browser side data access, so the game can be served as static files.
 *
 * Verified against each service: iTunes search and both preview CDNs send
 * `Access-Control-Allow-Origin: *`, and Spotify sends CORS for the calling
 * origin. Deezer's API sends no CORS header at all, so it is read through its
 * JSONP output instead.
 */

const MAX_TRACKS = 200;
const CONCURRENCY = 6;

/** Deezer preview links are signed for 15 minutes, so they are held for less. */
const SIGNED_TTL = 10 * 60 * 1000;
const STATIC_TTL = 6 * 60 * 60 * 1000;

interface Resolved {
  preview: string | null;
  art: string | null;
  rank: number | null;
}

const cache = new Map<string, { value: Resolved; expires: number }>();

function cacheGet(key: string): Resolved | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: Resolved): void {
  const ttl = value.preview && /hdnea=|exp=\d+/.test(value.preview) ? SIGNED_TTL : STATIC_TTL;
  cache.set(key, { value, expires: Date.now() + ttl });
}

let jsonpSeq = 0;

/** Deezer has no CORS, but it will answer as JSONP. */
function jsonp<T>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__snippet_jsonp_${(jsonpSeq += 1)}`;
    const script = document.createElement("script");
    let done = false;

    const cleanup = () => {
      done = true;
      delete (window as unknown as Record<string, unknown>)[name];
      script.remove();
      window.clearTimeout(timer);
    };

    const timer = window.setTimeout(() => {
      if (!done) {
        cleanup();
        reject(new Error("timeout"));
      }
    }, timeoutMs);

    (window as unknown as Record<string, unknown>)[name] = (data: T) => {
      if (done) return;
      cleanup();
      resolve(data);
    };

    script.src = `${url}${url.includes("?") ? "&" : "?"}output=jsonp&callback=${name}`;
    script.onerror = () => {
      if (!done) {
        cleanup();
        reject(new Error("network"));
      }
    };
    document.head.appendChild(script);
  });
}

async function mapLimit<In, Out>(
  items: readonly In[],
  limit: number,
  worker: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

async function fromItunes(track: RawTrack): Promise<Resolved | null> {
  const term = `${track.artist} ${track.title}`.replace(/\s+/g, " ").trim();
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: ItunesResult[] };
  for (const r of data.results ?? []) {
    if (!r.previewUrl || !r.trackName || !r.artistName) continue;
    if (isSameRecording({ title: r.trackName, artist: r.artistName }, track)) {
      return {
        preview: r.previewUrl,
        art: r.artworkUrl100?.replace("100x100bb", "512x512bb") ?? null,
        rank: null,
      };
    }
  }
  return null;
}

interface DeezerTrack {
  id?: number;
  title?: string;
  title_short?: string;
  preview?: string;
  rank?: number;
  readable?: boolean;
  link?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
}

async function deezerQuery(query: string, track: RawTrack): Promise<Resolved | null> {
  const data = await jsonp<{ data?: DeezerTrack[] }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
  ).catch(() => null);
  for (const r of data?.data ?? []) {
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

/**
 * Find a 30 second preview. Deezer runs first because one call returns the
 * preview and the popularity rank together, with iTunes covering the rest.
 */
async function resolveOne(track: RawTrack, refresh: boolean): Promise<Resolved> {
  if (track.preview && !refresh) {
    return { preview: track.preview, art: track.art ?? null, rank: track.rank ?? null };
  }
  if (!refresh) {
    const hit = cacheGet(track.id);
    if (hit) return hit;
  }

  let found: Resolved | null = null;
  try {
    found = await fromDeezer(track);
    if (!found) found = await fromItunes(track);
  } catch {
    found = null;
  }

  const result = found ?? { preview: null, art: null, rank: null };
  cacheSet(track.id, result);
  return result;
}

export async function resolvePreviews(
  tracks: readonly RawTrack[],
  refresh = false,
): Promise<Track[]> {
  const found = await mapLimit(tracks, CONCURRENCY, (t) => resolveOne(t, refresh));
  const out: Track[] = [];
  tracks.forEach((track, i) => {
    const hit = found[i];
    if (!hit?.preview) return;
    out.push({
      id: track.id,
      title: track.title,
      artist: track.artist,
      art: track.art ?? hit.art,
      preview: hit.preview,
      link: track.link ?? null,
      rank: track.rank ?? hit.rank,
      date: track.date ?? null,
    });
  });
  return out;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly code: "not_owned" | "not_found" | "empty" | "unauthorized" | "upstream",
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export async function loadDeezerPlaylist(id: string): Promise<{ name: string; tracks: RawTrack[] }> {
  const meta = await jsonp<{ title?: string; error?: unknown }>(
    `https://api.deezer.com/playlist/${encodeURIComponent(id)}`,
  ).catch(() => null);
  if (!meta || meta.error) {
    throw new SourceError("That playlist is private or does not exist.", "not_found");
  }

  const tracks: RawTrack[] = [];
  const seen = new Set<string>();
  let index = 0;

  while (tracks.length < MAX_TRACKS) {
    const page = await jsonp<{ data?: DeezerTrack[]; next?: string }>(
      `https://api.deezer.com/playlist/${encodeURIComponent(id)}/tracks?limit=50&index=${index}`,
    ).catch(() => null);
    const data = page?.data ?? [];
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

    if (!page?.next) break;
    index += 50;
  }

  if (tracks.length === 0) throw new SourceError("That playlist has no playable tracks.", "empty");
  return { name: meta.title ?? "Playlist", tracks };
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  type?: string;
  artists?: { name?: string }[];
  album?: { images?: { url?: string }[] };
  external_urls?: { spotify?: string };
}

interface SpotifyPage {
  items?: { item?: SpotifyTrack | null; track?: SpotifyTrack | null }[];
  next?: string | null;
}

/**
 * Since the February 2026 Web API changes this endpoint answers 403 unless the
 * signed in user owns the playlist or collaborates on it.
 */
export async function loadSpotifyPlaylist(
  id: string,
  token: string,
): Promise<{ name: string; tracks: RawTrack[] }> {
  const headers = { authorization: `Bearer ${token}` };

  const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`, {
    headers,
  });
  if (metaRes.status === 401) throw new SourceError("Session expired. Sign in again.", "unauthorized");
  if (metaRes.status === 404) throw new SourceError("That playlist does not exist.", "not_found");
  const meta = (await metaRes.json().catch(() => ({}))) as { name?: string };

  const tracks: RawTrack[] = [];
  const seen = new Set<string>();
  let url: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/items?limit=50`;

  while (url && tracks.length < MAX_TRACKS) {
    const res: Response = await fetch(url, { headers });
    if (res.status === 403) {
      throw new SourceError(
        "Spotify only lets apps read playlists you own or collaborate on. Copy it to your account, or use one of the options below.",
        "not_owned",
      );
    }
    if (res.status === 401) throw new SourceError("Session expired. Sign in again.", "unauthorized");
    if (!res.ok) throw new SourceError("Spotify is not responding.", "upstream");

    const page = (await res.json().catch(() => ({}))) as SpotifyPage;
    const items = page.items ?? [];
    if (items.length === 0) break;

    for (const entry of items) {
      // The February 2026 rename: items.items.item replaced tracks.tracks.track.
      const t = entry.item ?? entry.track;
      if (!t?.id || !t.name) continue;
      if (t.type && t.type !== "track") continue;
      const artist = (t.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
      if (!artist) continue;
      const key = `spotify:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push({
        id: key,
        title: t.name,
        artist,
        art: t.album?.images?.[0]?.url ?? null,
        link: t.external_urls?.spotify ?? null,
        rank: null,
      });
      if (tracks.length >= MAX_TRACKS) break;
    }

    url = page.next ?? null;
  }

  if (tracks.length === 0) throw new SourceError("That playlist has no playable tracks.", "empty");
  return { name: meta.name ?? "Playlist", tracks };
}
