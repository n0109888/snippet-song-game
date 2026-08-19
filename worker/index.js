/**
 * Reads a public Spotify playlist and hands it back as JSON the game can use.
 *
 * Spotify's own API will not do this: since the February 2026 changes it only
 * returns items for playlists the signed in user owns, so a visitor pasting a
 * link would have to log in and would still be refused for anyone else's list.
 * The embed page that powers Spotify's public widgets has no such limit and
 * carries the whole track list, previews included. It just sends no CORS
 * header, so a browser cannot read it. This sits in front and adds one.
 */

/** Spotify ids are base62. Bounded and checked, so the id cannot steer the fetch. */
const ID = /^[A-Za-z0-9]{16,40}$/;

/** Previews and names go stale slowly, and this is the slow half of a load. */
const CACHE_SECONDS = 3600;

function headers(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "86400",
    "cache-control": `public, max-age=${CACHE_SECONDS}`,
    "content-type": "application/json; charset=utf-8",
  };
}

function fail(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: headers(origin),
  });
}

/**
 * The page ships its state in a __NEXT_DATA__ script tag. Pulled out by index
 * rather than a regex across 80KB of HTML, which is faster and cannot catch on
 * a stray closing tag inside the JSON.
 */
function extractState(html) {
  const open = html.indexOf('<script id="__NEXT_DATA__"');
  if (open === -1) return null;
  const start = html.indexOf(">", open);
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(html.slice(start + 1, end));
  } catch {
    return null;
  }
}

export default {
  async fetch(request) {
    // Any site may read this: it only ever returns already public data.
    const origin = "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers(origin) });
    }
    if (request.method !== "GET") {
      return fail(405, "Use GET.", origin);
    }

    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!ID.test(id)) return fail(400, "Not a playlist id.", origin);

    let res;
    try {
      res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
        headers: {
          // Served the app shell without a browser agent, which has no state in it.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
          "accept-language": "en",
        },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch {
      return fail(502, "Could not reach Spotify.", origin);
    }

    if (res.status === 404) return fail(404, "That playlist does not exist.", origin);
    if (!res.ok) return fail(502, "Spotify is not responding.", origin);

    const state = extractState(await res.text());
    const entity = state?.props?.pageProps?.state?.data?.entity;
    const list = Array.isArray(entity?.trackList) ? entity.trackList : [];

    if (list.length === 0) {
      return fail(404, "That playlist is private, empty, or unavailable.", origin);
    }

    const tracks = [];
    for (const t of list) {
      const title = typeof t?.title === "string" ? t.title : "";
      const artist = typeof t?.subtitle === "string" ? t.subtitle : "";
      if (!title || !artist) continue;
      const uri = typeof t?.uri === "string" ? t.uri : "";
      tracks.push({
        id: uri || `spotify:embed:${tracks.length}`,
        title,
        artist,
        // The embed hands over the same 30s preview the widget plays, and that
        // CDN allows cross origin reads, so the game needs no lookup for it.
        preview: typeof t?.audioPreview?.url === "string" ? t.audioPreview.url : null,
      });
    }

    if (tracks.length === 0) return fail(404, "That playlist has no playable tracks.", origin);

    return new Response(
      JSON.stringify({
        name: typeof entity?.name === "string" ? entity.name : "Playlist",
        cover: entity?.coverArt?.sources?.[0]?.url ?? null,
        tracks,
      }),
      { headers: headers(origin) },
    );
  },
};
