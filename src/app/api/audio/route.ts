/**
 * Same origin proxy for 30 second previews, so the browser can fetch them as
 * an ArrayBuffer without a CORS problem.
 *
 * The source is restricted to the preview hosts of the two lookup services.
 * Without that allowlist this route would forward arbitrary requests on behalf
 * of the server. Only previews pass through, nothing is written to disk.
 */

const ALLOWED_HOSTS = [
  "audio-ssl.itunes.apple.com",
  "audio.itunes.apple.com",
  "is1-ssl.mzstatic.com",
];

const ALLOWED_SUFFIXES = [".dzcdn.net", ".mzstatic.com", ".itunes.apple.com"];

function permitted(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export async function GET(request: Request): Promise<Response> {
  const src = new URL(request.url).searchParams.get("src");
  if (!src) return new Response("missing source", { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response("bad source", { status: 400 });
  }

  if (!permitted(target)) return new Response("host not allowed", { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { accept: "audio/*" },
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }

  if (upstream.status === 403 || upstream.status === 410) {
    // Signed preview links expire; the client refreshes and retries on this.
    return new Response("preview expired", { status: 410 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }

  const length = upstream.headers.get("content-length");
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "audio/mpeg",
    // Previews are immutable once resolved, but Deezer signs its URLs with an
    // expiry, so this stays short.
    "cache-control": "private, max-age=600",
  });
  if (length) headers.set("content-length", length);

  return new Response(upstream.body, { status: 200, headers });
}
