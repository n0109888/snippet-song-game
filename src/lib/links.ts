import type { SourceKind } from "./types";

export interface ParsedLink {
  kind: Extract<SourceKind, "spotify" | "deezer">;
  id: string;
}

/**
 * Accepts open.spotify.com links including locale prefixes such as
 * /intl-de/, spotify:playlist: URIs, deezer.com links and bare ids.
 */
export function parsePlaylistLink(input: string): ParsedLink | null {
  const raw = input.trim();
  if (!raw) return null;

  const spotifyUri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(raw);
  if (spotifyUri?.[1]) return { kind: "spotify", id: spotifyUri[1] };

  const deezerUri = /^deezer:playlist:(\d+)$/.exec(raw);
  if (deezerUri?.[1]) return { kind: "deezer", id: deezerUri[1] };

  if (/^[A-Za-z0-9]{22}$/.test(raw)) return { kind: "spotify", id: raw };
  if (/^\d{6,}$/.test(raw)) return { kind: "deezer", id: raw };

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  const index = segments.findIndex((s) => s === "playlist");
  const next = index >= 0 ? segments[index + 1] : undefined;

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    if (next && /^[A-Za-z0-9]+$/.test(next)) return { kind: "spotify", id: next };
    return null;
  }

  if (host === "deezer.com" || host.endsWith(".deezer.com") || host === "deezer.page.link") {
    if (next && /^\d+$/.test(next)) return { kind: "deezer", id: next };
    return null;
  }

  return null;
}
