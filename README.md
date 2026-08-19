# Snippet

A song guessing game. You hear a very short piece of a track and name it. Each
wrong guess or skip unlocks a longer piece.

## Run it

```
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Where the audio comes from

Spotify does not serve audio to this app, so the two jobs are split. Spotify or
Deezer supplies the track list, and the 30 second preview is looked up
separately from iTunes Search, falling back to Deezer search. Only 30 second
previews are fetched. Nothing is written to disk and full tracks are never
requested.

Two limits are worth knowing before you file a bug:

1. `preview_url` was removed for apps created after November 2024, so the
   Spotify track object has no audio on it.
2. Since the February 2026 Web API changes, `GET /v1/playlists/{id}/items`
   returns contents only for playlists the signed in user owns or collaborates
   on. Any other playlist answers 403 and the app says so. Copy a playlist to
   your own account, or paste a Deezer link instead.

A track whose preview cannot be found is dropped from the round and counted in
a single line at load.

## Playlist sources

- Spotify link, needs sign in. Accepts `open.spotify.com/playlist/...`,
  locale prefixed links such as `/intl-de/playlist/...`, and
  `spotify:playlist:...`.
- Deezer link, no sign in. Deezer returns previews directly, so this is the
  quickest path.
- Paste a list, no sign in. One `Artist - Title` per line.

## Spotify setup

1. Open https://developer.spotify.com/dashboard and create an app.
2. Add a redirect URI. For local work use `http://127.0.0.1:3000`. Spotify
   rejects `localhost`, so use the loopback address and visit the app at the
   same address you registered.
3. Copy the client id into `.env.local`.
4. Sign in through the app. Authorization Code with PKCE is used, so there is
   no client secret.

Development mode apps require the app owner to hold Spotify Premium, and are
limited in how many users may be added. Both limits come from Spotify, not from
this app.

### Environment variables

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | Client id from the dashboard app |
| `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` | Redirect URI registered on that app, must match exactly |

Leave both empty and the Deezer and paste sources still work.

## Adding preset songs

Edit `data/preset-playlist.json`. Nothing else needs to change.

- `name`: label for the playlist.
- `tracks`: array of songs, each with `id`, `title`, `artist`.
- `art`: optional cover image URL, resolved automatically when omitted.
- `id`: any stable unique string, it keys the preview cache and the drop in point.

## Difficulty

| Difficulty | Stage lengths | Guesses | Hints |
| --- | --- | --- | --- |
| Easy | 2, 4, 7, 12, 20 | 5 | Album art sharpens each stage, artist after 3 misses |
| Medium | 1, 2, 4, 8, 16 | 5 | Artist after 4 misses |
| Hard | 0.5, 1, 2, 5, 10 | 4 | None |
| Expert | 0.1, 0.3, 1, 3, 8 | 3 | None |
| Impossible | 0.01, 0.05, 0.2, 1 | 2 | None, drop in forced |

Advanced settings expose the ladder, guess count and hints on their own. Change
any of them and the difficulty label reads Custom.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play, or advance the reveal |
| Enter | Submit the highlighted suggestion |
| S | Skip |
| Escape | Close the dropdown or the settings sheet |

## Notes on the audio

Snippet length is scheduled on the Web Audio clock with
`source.start(when, offset, duration)` and a matching `stop`, never with a
timer, so a 0.01 second snippet is 0.01 seconds. A short gain ramp on both ends
keeps the edges from clicking. The AudioContext is created on the first click,
never before, and the next track is fetched while the current one is in play.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | TypeScript, strict, no emit |
