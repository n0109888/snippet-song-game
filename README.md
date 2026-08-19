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
- `rank` is popularity from 0 to 1000000, and `date` is the release date. Both feed the sorts.

Previews are not stored, because the services sign them with an expiry. They are
looked up at play time, a few songs ahead of you, so a 180 song pack starts
instantly.

## Preset and Custom

**Preset** packs are the built in game: twelve cards, searchable by name. Ten are
artist discographies drawn from real play counts, plus the Kanye West catalogue
and the ohnepixel playlist. Click a card to start.

**Custom** is your own playlist, from a Spotify link, a Deezer link, or a pasted
list. No difficulty setting here, because a playlist you chose is already the
difficulty you wanted.

## Sorting

There is no difficulty setting. Once you are in a pack you choose the order:

| Sort | Order |
| --- | --- |
| Most played | Highest play count first, so a pack opens on its hits |
| Random | Shuffled |
| Newest first | Most recent release date first |

Play counts come from Deezer's `rank` and dates from each track's release date,
both stored in the pack file. Changing the sort restarts the round.

## Stages

Stages are the skip progression and you pick them yourself. Six lengths are
available: 0.01, 0.1, 0.5, 2, 8 and 15 seconds. All are on by default except
0.01s, which is opt in because it is shorter than most people can hear. Switch
any of them on or off in the settings; the last one cannot be switched off.

You start on the shortest selected length and every wrong guess or skip moves you
one step along.

## A round has no fixed length

Play as long as you like. After each song you press **Next song** yourself, so
there is time to sit with the answer. There is no score, only what you got and
what you missed. **Results** shows that list at any point, and **End** closes the
round on the same list.

## Listening after a guess

The reveal keeps playing the clip with a real transport: play, pause, a seek bar
you can scrub, and elapsed against total. Worth knowing: these are the same 30
second previews the game uses, so it is the whole clip, not the whole song. Full
recordings are never downloaded.

## Where a clip starts

Previews are 30 second excerpts cut from the middle of a song, not the opening.
Measured on the Deezer preview of Runaway, the clip opens at full level where the
real track opens on a sparse piano note. So **Clip start** means the start of the
clip and **Random** picks a stable point inside it.

Every preview measured also begins with 30 to 40 milliseconds of digital silence.
Starting at sample zero therefore made a 0.01 second snippet play nothing at all.
Clip start now seeks to the first audible moment, judged against the clip's own
overall level, so the shortest snippets carry actual sound.

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
