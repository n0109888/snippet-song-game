"use client";

/**
 * Authorization Code with PKCE. The browser only ever holds the verifier and
 * the resulting tokens, the code exchange itself goes through the server route
 * so there is no client secret anywhere.
 */

const VERIFIER_KEY = "snippet.pkce.verifier";
const TOKEN_KEY = "snippet.spotify.token";
const RETURN_KEY = "snippet.spotify.return";

const SCOPES = "playlist-read-private playlist-read-collaborative";

export interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function clientId(): string {
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
}

export function redirectUri(): string {
  const configured = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (configured) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function readToken(): StoredToken | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const t = parsed as Partial<StoredToken>;
    if (typeof t.accessToken !== "string" || typeof t.expiresAt !== "number") return null;
    return {
      accessToken: t.accessToken,
      refreshToken: typeof t.refreshToken === "string" ? t.refreshToken : null,
      expiresAt: t.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeToken(token: StoredToken | null): void {
  if (token) window.localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function signOut(): void {
  writeToken(null);
}

/** Sends the browser to Spotify. `returnTo` is restored after the redirect back. */
export async function beginLogin(returnTo: string): Promise<void> {
  const verifier = randomVerifier();
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  window.sessionStorage.setItem(RETURN_KEY, returnTo);

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challenge(verifier),
    scope: SCOPES,
  });

  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

async function exchange(body: Record<string, string>): Promise<StoredToken | null> {
  const res = await fetch("/api/spotify/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TokenReply;
  if (!res.ok || !data.access_token) return null;

  const token: StoredToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  writeToken(token);
  return token;
}

/**
 * Consumes `?code=` on load. Returns the stored return value so the caller can
 * resume whatever the user was doing before the redirect.
 */
export async function completeLogin(): Promise<{ ok: boolean; returnTo: string | null } | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const failed = url.searchParams.get("error");
  if (!code && !failed) return null;

  const returnTo = window.sessionStorage.getItem(RETURN_KEY);
  window.sessionStorage.removeItem(RETURN_KEY);
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  if (failed || !code) return { ok: false, returnTo };

  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) return { ok: false, returnTo };

  const token = await exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  return { ok: token !== null, returnTo };
}

/** Returns a live access token, refreshing silently when it is close to expiry. */
export async function accessToken(): Promise<string | null> {
  const token = readToken();
  if (!token) return null;
  if (token.expiresAt - Date.now() > 60_000) return token.accessToken;

  if (!token.refreshToken) {
    writeToken(null);
    return null;
  }

  const refreshed = await exchange({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
  });
  if (!refreshed) {
    writeToken(null);
    return null;
  }
  // Spotify may omit a new refresh token, keep the existing one.
  if (!refreshed.refreshToken) {
    writeToken({ ...refreshed, refreshToken: token.refreshToken });
  }
  return refreshed.accessToken;
}
