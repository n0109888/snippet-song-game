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

- `collections`: array of packs, each shown as a card on the Preset screen.
- A pack has `id`, `name`, `note`, `image`, and `tracks`.
- A track has `id`, `title`, `artist`, and optionally `art` and `rank`.
- `rank` is popularity from 0 to 1000000 and is what difficulty sorts on.

Previews are not stored, because the services sign them with an expiry. They are
looked up at play time, a few songs ahead of you, so a 180 song pack starts
instantly.

## Preset and Custom

**Preset** packs are the built in game. Each pack is a card you click to start.
Right now there is one, the Kanye West discography, 180 songs. Genres or other
artists are added by editing the JSON, nothing else changes.

**Custom** is your own playlist, from a Spotify link, a Deezer link, or a pasted
list. There is no difficulty setting here, because a playlist you chose is
already the difficulty you wanted.

## Difficulty, preset only

Difficulty picks **which songs** you get, not how long the snippet is. Songs are
ordered by how well known they are and each level draws from a band of that
order. Easy gives you the hits, Impossible gives you the deep cuts.

| Difficulty | Draws from | Score weight |
| --- | --- | --- |
| Easy | Best known 20 percent | 1 |
| Medium | 20 to 45 percent | 1.3 |
| Hard | 45 to 70 percent | 1.7 |
| Expert | 70 to 88 percent | 2.2 |
| Impossible | Most obscure 12 percent | 3 |

Bands are relative to the pack, so a pack of obscure songs still has an Easy end.
Changing difficulty redraws the round. Popularity comes from Deezer's `rank`,
because Spotify removed its `popularity` field in February 2026.

## Stages

The stage ladder is the skip progression, separate from difficulty. Pick one in
the settings menu:

| Ladder | Lengths |
| --- | --- |
| Standard | 0.01, 0.1, 0.5, 2, 5, 10 |
| Brutal | 0.01, 0.05, 0.2, 1 |
| Quick | 0.1, 0.3, 1, 3, 8 |
| Steady | 0.5, 1, 2, 5, 10 |
| Generous | 1, 2, 4, 8, 16 |
| Relaxed | 2, 4, 7, 12, 20 |

You start on the shortest length. Every wrong guess or skip moves you one step
along. Guess count and hints are under Advanced.

## A round has no fixed length

Play as long as you like. The round runs until you press End, which shows the
summary of everything you played.

## Where a clip starts

Previews are 30 second excerpts and the services cut them from the middle of the
song, not the beginning. Measured on a Deezer preview of Runaway, the clip opens
at full level where the real track opens on a sparse piano note. So **Clip start**
means the start of the 30 second clip, and **Random** picks a stable point inside
it. Getting the true opening of a song would need the full recording, which this
app never downloads.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play, or advance the reveal |
| Click | Advance the reveal |
| Enter | Submit the highlighted suggestion |
| S | Skip |
| Escape | Close the dropdown or the settings sheet |

## Theme

Dark by default, light in the settings menu. The choice is stored and applied
before the first paint, so it does not flash.

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
