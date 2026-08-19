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

Difficulty picks **which songs** you get, not how long the snippet is. Tracks are
ordered by how well known they are, and each difficulty draws from a band of that
order. Easy gives you the hits, Impossible gives you the deep cuts.

| Difficulty | Draws from | Score weight |
| --- | --- | --- |
| Easy | Best known 20 percent | 1 |
| Medium | 20 to 45 percent | 1.3 |
| Hard | 45 to 70 percent | 1.7 |
| Expert | 70 to 88 percent | 2.2 |
| Impossible | Most obscure 12 percent | 3 |

Bands are relative to the playlist you loaded, so an obscure playlist still has an
Easy end and a mainstream one still has an Impossible end. Changing difficulty
redraws the round. If a band cannot fill ten tracks it widens into its neighbours.

Popularity comes from Deezer's `rank`. Spotify removed the `popularity` field in
February 2026, so the rank is attached during preview lookup. A track with no
known rank is only used to top up a short round.

## Stages

The stage ladder is a separate setting, because it is the skip progression, not
the difficulty. The default ladder is `0.01 0.1 0.5 2 5 10`. You start on 0.01
seconds, and every wrong guess or skip moves you to the next length. Pick a
different ladder in the settings rail. Guess count and hints sit under Advanced.

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
