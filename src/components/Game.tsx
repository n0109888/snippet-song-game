"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Confetti, GoldRain, GoldWash, MissWash } from "./Effects";
import GuessInput from "./GuessInput";
import PresetPicker from "./PresetPicker";
import Reveal from "./Reveal";
import Settings, { Dice } from "./Settings";
import Stage from "./Stage";
import Summary, { ResultsList, type RoundResult } from "./Summary";
import { AudioEngine, DecodeError, dropInOffset } from "@/lib/audio";
import {
  INHUMAN_SECONDS,
  LEVELS,
  NO_HINTS,
  SORTS,
  bandFor,
  isMixedArtist,
  shuffle,
  sortTracks,
  stagesFor,
  tierFor,
  type Hints,
  type Mode,
  type Rules,
  type SortKey,
} from "@/lib/round";
import { resolvePreviews } from "@/lib/sources";
import { titleMatches } from "@/lib/normalize";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "@/lib/storage";
import {
  type LoadedPlaylist,
  type PresetCollection,
  type RawTrack,
  type StartMode,
  type Track,
} from "@/lib/types";
import presetData from "../../data/preset-playlist.json";

type Phase = "setup" | "loading" | "playing" | "done";

interface RevealState {
  solved: boolean;
  track: Track;
  atLength: number | null;
}

/** The word the badge says, and a key that replays it when it is said again. */
interface Dealt {
  key: number;
  label: string;
}

/** How many upcoming tracks to keep preview-resolved ahead of the player. */
const LOOKAHEAD = 4;

/** How deep into a level's band to dig before settling for a silent song. */
const CANDIDATES_PER_LEVEL = 4;

const COLLECTIONS = (presetData as { collections?: PresetCollection[] }).collections ?? [];

/** The turning arrow on the redealt badge. */
function Refresh() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="dealt-turn h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.4 12a8.4 8.4 0 1 1-2.5-6" />
      <path d="M20.4 4.2v4.8h-4.8" />
    </svg>
  );
}

export default function Game() {
  const engineRef = useRef<AudioEngine | null>(null);
  const revealTimer = useRef<number | null>(null);
  const queueRef = useRef<Track[]>([]);
  /** Round generation whose lookahead is in flight, or null when idle. */
  const resolvingRef = useRef<number | null>(null);
  /**
   * Every preview and cover this round has already looked up, held by track id.
   * Dealing again reuses them, so a change of sort does not pay for the same
   * lookups twice.
   */
  const foundRef = useRef(new Map<string, { preview: string | null; art: string | null }>());
  const roundRef = useRef(0);
  /** Deal generation, bumped before a guessable ladder goes looking for audio. */
  const dealRef = useRef(0);
  /** The deal a press of play was made on, while its song was still being drawn. */
  const wantPlayRef = useRef<number | null>(null);
  /**
   * Guessable only: a song for every level, drawn and warmed while one of them
   * is being played. It used to hold the next level alone, which made climbing
   * the ladder instant and every other move a wait, when jumping from Easy
   * straight to Impossible is exactly what the picker is for.
   */
  const benchRef = useRef(new Map<number, Track>());

  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const [phase, setPhase] = useState<Phase>("setup");
  const [playlist, setPlaylist] = useState<LoadedPlaylist | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  /** Guessable only: which level's song is on the card. */
  const [level, setLevel] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [misses, setMisses] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [playing, setPlaying] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [presetBusy, setPresetBusy] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  /** Asked for one song at a time, so they clear whenever the song does. */
  const [hints, setHints] = useState<Hints>(NO_HINTS);
  const [showResults, setShowResults] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  /**
   * Bumped every time the pack is dealt again. The lookahead keys off it, so a
   * new order is resolved even though the cursor is back where it already was.
   */
  const [roundId, setRoundId] = useState(0);
  /** Set while the redealt badge is on screen; the key replays it. */
  const [dealt, setDealt] = useState<Dealt | null>(null);
  /** Bumped whenever the bench is drawn from, so it is filled up again. */
  const [benchTick, setBenchTick] = useState(0);

  const rules = prefs.rules;
  const stages = stagesFor(rules);
  const guessable = prefs.mode === "guessable";
  const stageIndex = Math.min(misses, stages.length - 1);
  const track = queue[cursor];
  const currentLength = stages[stageIndex] ?? 1;
  // One guess per stage, so every selected length is reachable. The ladder runs
  // the same inside a guessable level: what the level changes is the song.
  const maxMisses = stages.length;
  const remaining = maxMisses - misses;
  // The colour a guessable round is played in. It is the room the level is
  // played in and nothing more, so it stops at the card: the pack list is not
  // at any level yet and has no business being washed in one. It stops at the
  // reveal too, because a verdict has a colour of its own and red over a level
  // washed yellow comes out neither red nor yellow.
  const levelTone =
    guessable && phase !== "setup" && !reveal ? (LEVELS[level]?.color ?? null) : null;

  /** The badge, which is the only sign that dealing again did anything. */
  const announce = useCallback((label: string) => {
    setDealt((d) => ({ key: (d?.key ?? 0) + 1, label }));
  }, []);

  function engine(): AudioEngine {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    return engineRef.current;
  }

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    setReady(true);
  }, []);

  /**
   * Guessable is painted dark whatever the stored theme says: the card is a
   * wash of the level's colour under a glowing button, and neither of those is
   * anything at all on paper white. The stored choice is left alone rather than
   * overwritten, so classic hands it straight back.
   */
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = guessable ? "dark" : prefs.theme;
  }, [ready, guessable, prefs.theme]);

  useEffect(() => {
    if (ready) engine().setVolume(prefs.volume);
  }, [ready, prefs.volume]);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      engineRef.current?.stop();
    },
    [],
  );

  /**
   * Resolve previews for the next few tracks only. A playlist can hold hundreds
   * of songs and a round has no fixed length, so resolving everything up front
   * would be a long wait for audio the player may never reach.
   */
  const topUp = useCallback(async (from: number) => {
    const round = roundRef.current;
    if (resolvingRef.current === round) return;
    // Art as well as audio: the Spotify reader supplies previews but no cover,
    // so a track can be playable and still need the lookup for its hint.
    const needs = (t: Track) => t.preview === null || t.art === null;
    const ahead = queueRef.current.slice(from, from + LOOKAHEAD);
    const head = ahead[0];
    // The song on the card goes on its own, in front of the ones behind it. A
    // batch is only done when its slowest member is, so putting the song being
    // played in with three nobody has reached yet made the wait before the
    // first note the wait for the fourth song's lookup.
    const batches = [head && needs(head) ? [head] : [], ahead.slice(1).filter(needs)].filter(
      (batch) => batch.length > 0,
    );
    if (batches.length === 0) return;

    resolvingRef.current = round;
    try {
      for (const batch of batches) {
        const resolved = await resolvePreviews(batch);
        for (const t of resolved) {
          foundRef.current.set(t.id, { preview: t.preview, art: t.art });
        }
        // Dealing again while this was in flight replaced the queue, so these
        // belong to a round that is gone. The lookups are kept all the same.
        if (roundRef.current !== round) return;
        const found = new Map(resolved.map((t) => [t.id, t]));

        const next = queueRef.current.map((t) => {
          const hit = found.get(t.id);
          // Keep whatever the source already gave us, it is an exact match where
          // the lookup is only ever a search for the closest title.
          return hit ? { ...t, preview: t.preview ?? hit.preview, art: t.art ?? hit.art } : t;
        });
        // Tracks the lookup could not match are dropped, but never one at or
        // before the cursor, because that would swap the song being played.
        const attempted = new Set(batch.map((t) => t.id));
        queueRef.current = next.filter(
          (t, i) => i <= from || t.preview !== null || !attempted.has(t.id),
        );
        setQueue(queueRef.current);
      }
    } catch {
      // Leave the queue as it is, the player can skip past a bad track.
    } finally {
      // Only if a later round has not already claimed the slot.
      if (resolvingRef.current === round) resolvingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    void topUp(cursor);
  }, [phase, cursor, roundId, topUp]);

  /** The redealt badge says its piece and goes. */
  useEffect(() => {
    if (!dealt) return;
    const timer = window.setTimeout(() => setDealt(null), 1400);
    return () => window.clearTimeout(timer);
  }, [dealt]);

  /** Load artwork up front, so a hint is on screen the moment the track is. */
  const warmArt = useCallback(async (url: string | null): Promise<void> => {
    if (!url) return;
    await new Promise<void>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  }, []);

  /**
   * Decode the current track's audio, and its artwork when hinted. The next one
   * is warmed in the background. Decoding is the slow part, so doing it here,
   * rather than under the press, is what makes pressing play immediate.
   */
  useEffect(() => {
    if (phase !== "playing") return;
    const current = queue[cursor];
    const next = queue[cursor + 1];

    const preview = current?.preview;
    if (current && preview) {
      void Promise.all([engine().warm(current.id, preview), warmArt(current.art)]).catch(
        () => {
          // Play surfaces the failure and refreshes the link.
        },
      );
    }

    const nextPreview = next?.preview;
    if (next && nextPreview) {
      void engine().warm(next.id, nextPreview).catch(() => undefined);
      void warmArt(next.art);
    }
  }, [phase, queue, cursor, warmArt]);

  /**
   * Everything a drawn song needs before it can be heard, started but never
   * waited on. It runs the moment a song is picked rather than after the card
   * carrying it has rendered, so the download is already in flight while React
   * is still painting.
   */
  const prime = useCallback(
    (picked: Track | null): Track | null => {
      if (picked?.preview) {
        void engine()
          .warm(picked.id, picked.preview)
          .catch(() => undefined);
        void warmArt(picked.art);
      }
      return picked;
    },
    [warmArt],
  );

  /** Resolve one track right now, so pressing play never waits on the lookahead. */
  const resolveNow = useCallback(
    async (target: Track, refresh = false): Promise<string | null> => {
      try {
        const [hit] = await resolvePreviews([{ ...target, preview: null }], refresh);
        if (hit?.preview) {
          const preview = hit.preview;
          foundRef.current.set(target.id, { preview, art: hit.art ?? target.art ?? null });
          queueRef.current = queueRef.current.map((t) =>
            t.id === target.id ? { ...t, preview } : t,
          );
          setQueue(queueRef.current);
          return preview;
        }
        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Previews found earlier in the session carry over, so dealing a pack you
   * have been playing lands on songs that are ready to hear.
   */
  const remembered = useCallback((t: Track): Track => {
    const hit = foundRef.current.get(t.id);
    return hit ? { ...t, preview: t.preview ?? hit.preview, art: t.art ?? hit.art } : t;
  }, []);

  /**
   * Put a queue on the card. The round generation moves with it, which is what
   * tells the lookahead to resolve the new order: the cursor is back at zero,
   * where it usually already was, so that alone would look like nothing had
   * changed. The run's history is left alone, because a guessable level is
   * dealt one at a time and the levels before it still count.
   */
  const showQueue = useCallback((drawn: Track[]) => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    engineRef.current?.stop();
    roundRef.current += 1;
    setRoundId(roundRef.current);
    queueRef.current = drawn;
    setQueue(drawn);
    setCursor(0);
    setMisses(0);
    setReveal(null);
    setHints(NO_HINTS);
    // Zero means nothing to fire, so a fresh card does not replay the burst.
    setConfettiKey(0);
    setPlaying(false);
    setError(null);
    setPhase("playing");
  }, []);

  /**
   * Draw a song out of a level's band, and make sure it has audio. The draw is
   * random every time, so coming back to a level you already played is a
   * different song rather than the same one again.
   *
   * Every candidate is searched for at once and the level takes the first one
   * that answers with audio. Two things used to be waited on that never had to
   * be: the candidates were tried one after another, so a band whose first
   * three songs were missing cost three round trips end to end, and then the
   * batch that replaced it still waited for the slowest of the four before
   * handing back the one it was going to use. The pick is random either way,
   * because the order it races in was shuffled.
   */
  const draw = useCallback(
    async (pool: readonly Track[]): Promise<Track | null> => {
      const order = shuffle(pool).map(remembered).slice(0, CANDIDATES_PER_LEVEL);
      const ready = order.find((t) => t.preview);
      if (ready) return prime(ready);
      if (order.length === 0) return null;

      const won = await Promise.any(
        order.map(async (candidate) => {
          const [hit] = await resolvePreviews([candidate]);
          // A candidate with no audio is not a result, it is one runner out of
          // the race, so it rejects and lets the others carry on.
          if (!hit) throw new Error("no audio");
          foundRef.current.set(hit.id, { preview: hit.preview, art: hit.art });
          return hit;
        }),
      ).catch(() => null);

      // Nothing in the band could be found. The first candidate goes up anyway
      // and play says so, which is better than a level that will not open.
      return prime(won ?? order[0] ?? null);
    },
    [remembered, prime],
  );

  /**
   * Open a level on a freshly drawn song. Every arrival here redraws, whether
   * it came from naming the song before it, from missing one, or from picking
   * the level out of the row, so the mix is never the same run twice.
   */
  const openLevel = useCallback(
    (loaded: LoadedPlaylist, index: number) => {
      const deal = (dealRef.current += 1);
      engineRef.current?.stop();
      setPlaying(false);
      setReveal(null);
      setError(null);
      setLevel(index);

      // Already drawn, and its audio already fetched, while another level was
      // being played: arriving is a change of state and nothing else, with no
      // lookup to wait on and so no spinner to sit through.
      const benched = benchRef.current.get(index);
      if (benched) {
        benchRef.current.delete(index);
        setBenchTick((t) => t + 1);
        showQueue([benched]);
        // Decoded audio means the card has nothing left to wait for, and saying
        // so here rather than an effect later is what keeps the stage from
        // blinking through Loading on its way in.
        return;
      }

      setPhase("loading");
      void (async () => {
        const picked = await draw(bandFor(loaded.tracks, index));
        // Drawn again while this was out looking, so this song is stale.
        if (dealRef.current !== deal) return;
        if (!picked) {
          setError("Nothing playable at that level.");
          setPhase("playing");
          return;
        }
        showQueue([picked]);
        setBenchTick((t) => t + 1);
      })();
    },
    [draw, showQueue],
  );

  /**
   * Keep a song waiting on every level the player is not on, and fetch its
   * audio and its cover too, which the draw itself starts. The wait for a
   * level is a lookup and a download, and both of them happen here, in the
   * seconds spent guessing, rather than after the press that asks for it. All the missing levels go at once: they
   * are separate searches and doing them in turn would leave whichever level
   * came last still loading when it was pressed.
   */
  useEffect(() => {
    // Only once the level that was asked for is up. The searches all go to the
    // same host, and a browser will only hold a handful of connections to one:
    // filling four levels while a fifth is still being drawn put sixteen
    // lookups in front of the one the player is waiting on.
    if (!guessable || !playlist || phase !== "playing") return;
    const missing = LEVELS.map((_, i) => i).filter(
      (i) => i !== level && !benchRef.current.has(i),
    );
    if (missing.length === 0) return;
    let cancelled = false;

    void Promise.all(
      missing.map(async (target) => {
        const picked = await draw(bandFor(playlist.tracks, target));
        // The pack changed while this was out looking, so the song is for a
        // ladder that is no longer up.
        if (cancelled || !picked) return;
        benchRef.current.set(target, picked);
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [guessable, phase, playlist, level, benchTick, draw]);

  /**
   * Deal the pack the way the chosen mode wants it, from the top. Classic is
   * the whole pack in the chosen order; guessable is one song at a time and
   * starts on Easy.
   */
  const beginRound = useCallback(
    (
      loaded: LoadedPlaylist,
      sort: SortKey,
      mode: Mode,
      // Said by the badge once the deal lands, never before: a guessable level
      // is off looking for audio while the header it appears in is not on
      // screen, and a badge that spends its second there is never read.
      label?: string,
    ) => {
      setResults([]);
      if (mode === "guessable") {
        openLevel(loaded, 0);
        if (label) announce(label);
        return;
      }
      dealRef.current += 1;
      showQueue(sortTracks(loaded.tracks, sort).map(remembered));
      if (label) announce(label);
    },
    [announce, openLevel, remembered, showQueue],
  );

  const loadTracks = useCallback(
    (raw: RawTrack[], name: string, source: LoadedPlaylist["source"], sourceId: string) => {
      const tracks: Track[] = raw.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        art: t.art ?? null,
        preview: t.preview ?? null,
        link: t.link ?? null,
        rank: t.rank ?? null,
        date: t.date ?? null,
      }));

      if (tracks.length === 0) {
        setError("That playlist has no playable tracks.");
        setPhase("setup");
        return null;
      }

      // A different pack is a different set of songs, so nothing found for the
      // last one is worth keeping.
      foundRef.current.clear();
      benchRef.current.clear();
      const loaded: LoadedPlaylist = { name, source, sourceId, tracks };
      setPlaylist(loaded);
      update({ lastSource: source, lastSourceId: sourceId });
      return loaded;
    },
    [update],
  );

  const startPreset = useCallback(
    (collection: PresetCollection) => {
      setError(null);
      setPresetBusy(collection.id);
      // Take the gesture now rather than waiting for the first press of play.
      void engine().resume();
      const loaded = loadTracks(
        collection.tracks as RawTrack[],
        collection.name,
        "preset",
        collection.id,
      );
      if (loaded) beginRound(loaded, prefs.sort, prefs.mode);
      setPresetBusy(null);
    },
    [loadTracks, beginRound, prefs.sort, prefs.mode],
  );

  const advance = useCallback(() => {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    engineRef.current?.stop();
    setPlaying(false);
    setReveal(null);
    setHints(NO_HINTS);
    setMisses(0);

    // Guessable holds one song at a time, so moving on is moving up a level,
    // and the ladder is a loop: past the last level it comes round to the first,
    // so a run carries on rather than stopping on a screen about itself.
    if (guessable) {
      if (playlist) openLevel(playlist, (level + 1) % LEVELS.length);
      return;
    }

    setCursor((c) => {
      const next = c + 1;
      if (next >= queueRef.current.length) {
        setPhase("done");
        return c;
      }
      return next;
    });
  }, [guessable, level, playlist, openLevel]);

  const finishTrack = useCallback(
    (solved: boolean, solvedAt: number | null) => {
      const current = queueRef.current[cursor];
      if (!current) return;
      engineRef.current?.stop();
      setPlaying(false);
      setResults((r) => [
        ...r,
        { track: current, solvedAt, length: currentLength, level: guessable ? level : null },
      ]);
      setReveal({
        solved,
        track: current,
        atLength: solvedAt === null ? null : currentLength,
      });
      if (solved) setConfettiKey((k) => k + 1);
    },
    [cursor, currentLength, guessable, level],
  );

  const miss = useCallback(() => {
    if (reveal || phase !== "playing") return;
    const next = misses + 1;
    if (next >= maxMisses) {
        finishTrack(false, null);
      return;
    }
    engineRef.current?.stop();
    setPlaying(false);
    setMisses(next);
  }, [reveal, phase, misses, maxMisses, finishTrack]);

  const guess = useCallback(
    (value: string) => {
      if (!track || reveal || phase !== "playing") return;
      if (titleMatches(value, track.title)) {
          finishTrack(true, stageIndex);
      } else {
        miss();
      }
    },
    [track, reveal, phase, stageIndex, finishTrack, miss],
  );

  const play = useCallback(() => {
    if (reveal) return;
    if (!track) {
      // Pressed while the song was still being drawn. The press is kept rather
      // than dropped, so the round opens the moment it has something to open:
      // the button is live from the first frame of the card and has to mean it.
      wantPlayRef.current = dealRef.current;
      void engine().resume();
      return;
    }

    const audio = engine();
    if (playing) {
      audio.stop();
      setPlaying(false);
      return;
    }

    // Create the context inside the gesture, before any await.
    audio.ensure();
    // Every rung opens the clip again rather than carrying on from the one
    // below it. What a longer snippet buys is more of the same beginning, so
    // the thing being named is always the way the song starts.
    const length = currentLength;

    void (async () => {
      try {
        // Browsers start the context suspended and resume is async, so waiting
        // here is what stops the first press from doing nothing.
        await audio.resume();

        const preview = track.preview ?? (await resolveNow(track));
        if (!preview) {
          setError("No audio for this one.");
          advance();
          return;
        }

        let ready = preview;
        try {
          await audio.load(track.id, ready);
        } catch (err) {
          // A signed preview link can expire mid round. Get a fresh one and
          // retry once before giving up on the track.
          if (!(err instanceof DecodeError) || !err.expired) throw err;
          audio.forget(track.id);
          const fresh = await resolveNow(track, true);
          if (!fresh) throw err;
          ready = fresh;
          await audio.load(track.id, ready);
        }

        const longest = Math.max(...stages);
        const base =
          prefs.startMode === "dropin"
            ? dropInOffset(track.id, audio.duration(track.id), longest)
            : audio.onset(track.id);
        audio.play(track.id, base, length, () => setPlaying(false));
        setPlaying(true);
        setError(null);
      } catch (err) {
        setPlaying(false);
        if (err instanceof DecodeError) {
          setError("That track would not play.");
          advance();
        } else {
          setError("Playback failed.");
        }
      }
    })();
  }, [track, reveal, playing, stages, currentLength, prefs.startMode, advance, resolveNow]);

  /**
   * Make good on a press that landed before the song did. It is tied to the
   * deal it was made on, so asking for another level in the meantime cancels
   * it rather than starting a song nobody pressed for.
   */
  useEffect(() => {
    if (wantPlayRef.current !== dealRef.current) return;
    if (phase !== "playing" || !track || reveal || playing) return;
    wantPlayRef.current = null;
    play();
  }, [phase, track, reveal, playing, play]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape" && (sheetOpen || showResults || showTracks)) {
        setSheetOpen(false);
        setShowResults(false);
        setShowTracks(false);
        return;
      }
      if (typing || phase !== "playing") return;

      if (event.code === "Space") {
        event.preventDefault();
        if (reveal) advance();
        else play();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "s" || event.key === "S") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        if (!reveal) miss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, reveal, sheetOpen, showResults, showTracks, play, miss, advance]);

  useEffect(() => {
    function offline() {
      setError("Offline.");
    }
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);

  // Named on the shortest snippet on the ladder: the celebration goes gold.
  const maxWin = reveal !== null && reveal.solved && reveal.atLength === INHUMAN_SECONDS;

  const tier = tierFor(currentLength);

  // A pack of one artist answers its own artist hint, and its search needs no
  // artist beside every title.
  const mixedArtist = useMemo(
    () => isMixedArtist(playlist?.tracks ?? []),
    [playlist],
  );

  const settingsPanel = (
    <Settings
      rules={rules}
      hints={hints}
      mode={prefs.mode}
      inRound={phase === "playing"}
      canReroll={phase === "playing" && !guessable && prefs.sort === "random"}
      showArtistHint={mixedArtist}
      playlistName={playlist?.name ?? null}
      trackCount={playlist?.tracks.length ?? 0}
      startMode={prefs.startMode}
      volume={prefs.volume}
      theme={prefs.theme}
      showTheme={!guessable}
      onStartMode={(next: StartMode) => update({ startMode: next })}
      onMode={setMode}
      onReroll={() => deal("random")}
      onRules={(next: Rules) => update({ rules: next })}
      onHints={setHints}
      onVolume={(v) => {
        update({ volume: v });
        engine().setVolume(v);
      }}
      onTheme={(next) => update({ theme: next })}
      onHome={goHome}
      onHistory={() => setShowResults(true)}
      onReset={() => setConfirmReset(true)}
      onTracks={() => setShowTracks(true)}
    />
  );

  /**
   * Deal the pack again in the order that is already selected. Reordering is
   * the whole of what changed, so it says so: the round always restarts on song
   * one, which on its own is indistinguishable from nothing having happened.
   */
  function deal(sort: SortKey) {
    if (!playlist) return;
    beginRound(playlist, sort, prefs.mode, "Reordered");
  }

  /**
   * New songs for the whole ladder. A level draws afresh every time it is
   * opened, so throwing away the one already drawn for the next level is enough
   * to make every rung new. It deals from Easy, because a run whose songs have
   * all been replaced is a new run and not the one that was part way up.
   */
  function rerollLevels() {
    if (!playlist) return;
    benchRef.current.clear();
    beginRound(playlist, prefs.sort, prefs.mode, "Rerolled");
  }

  /**
   * Change mode mid pack. Nothing is torn down and reloaded: the same loaded
   * pack is simply dealt the other way, so the switch is one card away rather
   * than a trip back through the pack list.
   */
  function setMode(next: Mode) {
    if (next === prefs.mode) return;
    update({ mode: next });
    if (!playlist || phase === "setup") return;
    beginRound(playlist, prefs.sort, next, next === "guessable" ? "Guessable" : "Classic");
  }

  /**
   * The order, and what a change of it says. The pack's name is not here: the
   * panel beside the card already carries it, and naming it twice on one screen
   * is not what the row is for. Guessable has no order to choose, so the row is
   * only ever the badge there, and it stands down rather than leave a gap.
   */
  const roundHeader =
    guessable && !dealt ? null : (
      <div className="flex items-center gap-2">
        {guessable ? null : (
          <select
            aria-label="Sort by"
            value={prefs.sort}
            onChange={(e) => {
              const next = e.target.value as SortKey;
              update({ sort: next });
              deal(next);
            }}
            className="h-7 shrink-0 rounded-chip border border-line bg-panel px-2 text-xs text-muted focus:border-line-strong"
          >
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {dealt ? (
          <span
            key={dealt.key}
            role="status"
            className="dealt flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
          >
            <Refresh />
            {dealt.label}
          </span>
        ) : null}
      </div>
    );

  /**
   * The levels, and the way between them. Every press redraws, so going back to
   * one you have already played is a different song, and a run you restart is a
   * different mix. It stays on screen through the draw and through the reveal,
   * because missing a song is exactly when you want to pick where to go next.
   */
  const levelPicker = (
    <div className="levels shrink-0" role="group" aria-label="Level">
      {LEVELS.map((step, i) => {
        const on = i === level;
        return (
          <button
            key={step.name}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (playlist) openLevel(playlist, i);
            }}
            style={{
              ...(on
                ? {
                    backgroundColor: step.color,
                    color: step.ink,
                    boxShadow: `0 0 24px -4px color-mix(in srgb, ${step.color} 85%, transparent)`,
                  }
                : {
                    // Its own colour held well back, so an unpicked level still
                    // reads as that level rather than as an empty outline.
                    backgroundColor: `color-mix(in srgb, ${step.color} 17%, transparent)`,
                    color: step.color,
                  }),
            }}
            className="pill h-10 rounded-full px-2.5 text-[13px] font-extrabold"
          >
            {step.name}
          </button>
        );
      })}
    </div>
  );

  /**
   * The same five levels down the side of the card, and the button that deals
   * the lot again. The row on the card is what a phone gets and what a
   * recording crops to; this is where the pointer already is on a wide window,
   * with room for the names at full size and for a control the row has no
   * width to spare for.
   */
  const levelRail = (
    <div className="flex flex-col gap-3.5" role="group" aria-label="Level">
      {LEVELS.map((step, i) => {
        const on = i === level;
        return (
          <button
            key={step.name}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (playlist) openLevel(playlist, i);
            }}
            style={
              on
                ? {
                    backgroundColor: step.color,
                    color: step.ink,
                    boxShadow: `0 0 26px -4px color-mix(in srgb, ${step.color} 80%, transparent)`,
                  }
                : undefined
            }
            className={`pill h-11 rounded-full px-3 text-[15px] font-bold ${
              on ? "" : "bg-raised text-muted hover:text-ink"
            }`}
          >
            {step.name}
          </button>
        );
      })}

      <button
        type="button"
        onClick={rerollLevels}
        className="pill mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-raised px-3 text-[15px] font-bold text-muted hover:text-ink"
      >
        <Dice />
        Reroll all
      </button>
    </div>
  );

  // The phone shaped card, which is also what the effects are drawn inside.
  // Dealing a guessable ladder keeps it, so switching mode swaps what is on the
  // card rather than collapsing the card and building it again.
  const onCard = phase !== "setup";

  /** Back to the pack list, keeping every preference. */
  function goHome() {
    engineRef.current?.stop();
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    setPlaying(false);
    setReveal(null);
    setResults([]);
    setPlaylist(null);
    setLevel(0);
    setError(null);
    setHints(NO_HINTS);
    setConfettiKey(0);
    setSheetOpen(false);
    setShowTracks(false);
    setPhase("setup");
  }

  /**
   * Deal the loaded pack again from the first song. It stays on the pack you
   * picked, because losing that as well is not what starting over means; the
   * home button beside it is how you leave. Only a round with no pack behind it
   * has nothing to deal, and that can only be a fresh page.
   */
  function startOver() {
    setConfirmReset(false);
    setSheetOpen(false);
    // No badge here: on a fixed sort this deals the same order back, and the
    // sheet closing onto the first song is answer enough for a button you had
    // to confirm.
    if (playlist) beginRound(playlist, prefs.sort, prefs.mode);
    else window.location.reload();
  }


  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center border-b border-line px-5 py-3">
        <button
          type="button"
          onClick={goHome}
          title="Home"
          className="home font-mono text-sm uppercase tracking-[0.14em] hover:text-accent"
        >
          Snippet
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
          {/* The rail rides with the card rather than sitting out at the edge
              of the window: it is the card's own controls, and a column of
              them across a gap the width of the card is a column of them
              belonging to nothing. Only ever the levels, so it is only ever
              there when there are levels. */}
          {ready && guessable && onCard ? (
            <div className="mr-5 hidden w-32 shrink-0 lg:block">{levelRail}</div>
          ) : null}

          <div
            className={
              onCard
                ? // Phone shaped, so a recording of the centre crops cleanly.
                  "level-wash relative flex h-full w-auto max-w-full shrink-0 items-center justify-center no-bars overflow-y-auto rounded-panel border border-line px-5 py-6 aspect-[9/16]"
                : "no-bars flex h-full w-full items-center justify-center overflow-y-auto"
            }
            // The card takes the level's colour, gathered behind the play
            // button and thinning out to nothing at the edges. Held low: it is
            // meant to be the room the level is played in, not a filter over it.
            style={
              levelTone
                ? {
                    background: `radial-gradient(112% 64% at 50% 72%, color-mix(in srgb, ${levelTone} 13%, transparent) 0%, transparent 72%), color-mix(in srgb, ${levelTone} 4%, transparent)`,
                    borderColor: `color-mix(in srgb, ${levelTone} 22%, var(--color-line))`,
                  }
                : undefined
            }
          >
          {/* Both effects fill the card, so they only exist while it does. */}
          {onCard ? (
            <>
              {reveal && !reveal.solved ? <MissWash /> : null}
              {maxWin ? <GoldWash /> : null}
              <Confetti fireKey={confettiKey} gold={maxWin} />
              {maxWin ? <GoldRain /> : null}
            </>
          ) : null}
          {!ready ? null : phase === "done" ? (
            <Summary
              results={results}
              stageCount={guessable ? 1 : stages.length}
              guessable={guessable}
              onAgain={() => {
                if (playlist) beginRound(playlist, prefs.sort, prefs.mode);
                else setPhase("setup");
              }}
              onExit={() => setPhase("setup")}
            />
          ) : phase === "playing" && reveal ? (
            <div className="flex w-full max-w-lg flex-col gap-6">
              {guessable ? levelPicker : null}
              <Reveal
                track={reveal.track}
                solved={reveal.solved}
                atLength={reveal.atLength}
                max={maxWin}
                nextLabel={guessable ? "Go next" : "Next song"}
                engine={engine()}
                onNext={advance}
              />
            </div>
          ) : (phase === "playing" && track) || phase === "loading" ? (
            // One tree from the moment a level is asked for to the moment its
            // song can be heard. Nothing on this card except the two hints is
            // about the song, so none of it has any reason to wait for one:
            // the ladder, the bar, the button and the search box are up while
            // the draw is still out, and the button carries the wait on its own
            // rather than a spinner standing where the whole card should be.
            // It also means the order above it is never remounted, and so the
            // badge beside it is never restarted, the moment a wait ends.
            <div className="flex w-full max-w-lg flex-col gap-8">
              {roundHeader}
              {guessable ? levelPicker : null}

              {hints.art && track?.art ? (
                <div className="flex justify-center">
                  <div className="glow-in h-28 w-28 overflow-hidden rounded-panel border border-line">
                    <Image
                      src={track.art}
                      alt=""
                      width={112}
                      height={112}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              ) : null}

              <Stage
                stages={stages}
                unlocked={stageIndex}
                tone={levelTone}
                playing={playing}
                engine={engine()}
                onPlay={play}
              />

              <GuessInput
                tracks={playlist?.tracks ?? []}
                showArtist={mixedArtist}
                // Typing can start as soon as there is a song to name, even
                // while its audio is still coming down.
                disabled={phase !== "playing"}
                onGuess={guess}
                onSkip={miss}
                remaining={remaining}
              />

              <div className="flex min-h-12 flex-col items-center gap-2">
                {error ? (
                  <span className="text-sm text-[var(--color-bad)]">{error}</span>
                ) : hints.artist && track ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
                      Artist
                    </span>
                    <span className="text-xl font-semibold" style={{ color: tier.color }}>
                      {track.artist}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <PresetPicker collections={COLLECTIONS} busy={presetBusy} onStart={startPreset} />
          )}
          </div>
        </main>

        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-line px-5 py-6 lg:block">
          {ready ? settingsPanel : null}
        </aside>

        <div className="shrink-0 border-t border-line px-5 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="h-9 w-full rounded-control border border-line text-xs text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            Settings
          </button>
        </div>
      </div>

      {confirmReset ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmReset(false)}
            className="absolute inset-0 bg-[rgba(0,0,0,0.55)]"
          />
          <div className="press-in relative flex w-full max-w-xs flex-col gap-4 rounded-panel border border-line bg-panel p-5">
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold">Reset</span>
              <span className="text-sm text-muted">
                Fully resets all rounds.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startOver}
                className="pill h-9 flex-1 rounded-full border border-transparent bg-[var(--color-bad)] text-sm font-medium text-white"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="pill h-9 flex-1 rounded-full border border-line text-sm text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTracks && playlist ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowTracks(false)}
            className="absolute inset-0 bg-[rgba(0,0,0,0.55)]"
          />
          <div className="press-in relative flex max-h-[80dvh] w-full max-w-md flex-col gap-4 rounded-panel border border-line bg-panel p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                {playlist.name}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {playlist.tracks.length} songs
              </span>
            </div>
            <ol className="no-bars flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {playlist.tracks.map((t, i) => (
                <li key={`${t.id}-${i}`} className="flex items-baseline gap-3 text-sm">
                  <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.title}
                    <span className="text-faint"> {t.artist}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setShowTracks(false)}
              className="h-9 shrink-0 self-start rounded-control border border-line px-4 text-sm text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showResults ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowResults(false)}
            className="absolute inset-0 bg-[rgba(0,0,0,0.55)]"
          />
          <div className="press-in relative flex w-full max-w-md flex-col gap-4 rounded-panel border border-line bg-panel p-5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                History
              </span>
              <span className="font-mono text-sm tabular-nums">
                {results.filter((r) => r.solvedAt !== null).length}/{results.length}
              </span>
            </div>
            <ResultsList
              results={results}
              stageCount={guessable ? 1 : stages.length}
              guessable={guessable}
            />
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="h-9 self-start rounded-control border border-line px-4 text-sm text-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {sheetOpen ? (
        <div className="fixed inset-0 z-30 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="flex-1 bg-[rgba(0,0,0,0.6)]"
          />
          <div className="max-h-[75dvh] overflow-y-auto rounded-t-panel border-t border-line bg-bg px-5 pb-8 pt-5">
            {settingsPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
