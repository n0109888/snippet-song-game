import { NextResponse } from "next/server";

/**
 * PKCE token exchange and refresh. Runs on the server so the browser never
 * talks to accounts.spotify.com directly, though with PKCE there is still no
 * client secret involved.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface Body {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Spotify client id is not configured" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const form = new URLSearchParams({ client_id: clientId });

  if (body.grant_type === "authorization_code") {
    if (!body.code || !body.redirect_uri || !body.code_verifier) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    form.set("grant_type", "authorization_code");
    form.set("code", body.code);
    form.set("redirect_uri", body.redirect_uri);
    form.set("code_verifier", body.code_verifier);
  } else if (body.grant_type === "refresh_token") {
    if (!body.refresh_token) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", body.refresh_token);
  } else {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "Spotify sign in failed" }, { status: res.status });
  }
  return NextResponse.json(data, { status: 200 });
}
