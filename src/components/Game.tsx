"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Confetti, GoldRain, GoldWash, MissWash } from "./Effects";
import GuessInput from "./GuessInput";
import PresetPicker from "./PresetPicker";
import Reveal from "./Reveal";
import Settings from "./Settings";
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
  /**
   * Guessable only: the song for the level after this one, drawn and warmed
   * while the current one is still being played, so moving up is instant.
   */
  const aheadRef = useRef<{ level: number; track: Track } | null>(null);

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
  const [loadingAudio, setLoadingAudio] = useState(false);
  /** Track whose audio, and artwork when hinted, are decoded and ready. */
  const [readyId, setReadyId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  /**
   * Bumped every time the pack is dealt again. The lookahead keys off it, so a
   * new order is resolved even though the cursor is back where it already was.
   */
  const [roundId, setRoundId] = useState(0);
  /** Set while the redealt badge is on screen; the key replays it. */
  const [dealt, setDealt] = useState<Dealt | null>(null);

  const rules = prefs.rules;
  const stages = rules.stages;
  const guessable = prefs.mode === "guessable";
  const stageIndex = Math.min(misses, stages.length - 1);
  const track = queue[cursor];
  const currentLength = stages[stageIndex] ?? 1;
  // One guess per stage, so every selected length is reachable. The ladder runs
  // the same inside a guessable level: what the level changes is the song.
  const maxMisses = stages.length;
  const remaining = maxMisses - misses;
  const levelTone = guessable ? (LEVELS[level]?.color ?? null) : null;

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
    document.documentElement.dataset.theme = stored.theme;
    setReady(true);
  }, []);

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
    const pending = queueRef.current
      .slice(from, from + LOOKAHEAD)
      .filter((t) => t.preview === null || t.art === null);
    if (pending.length === 0) return;

    resolvingRef.current = round;
    try {
      const resolved = await resolvePreviews(pending);
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
      const attempted = new Set(pending.map((t) => t.id));
      queueRef.current = next.filter(
        (t, i) => i <= from || t.preview !== null || !attempted.has(t.id),
      );
      setQueue(queueRef.current);
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
   * Decode the current track's audio, and its artwork when hinted, before the
   * track is shown. The next one is warmed in the background. Decoding is the
   * slow part, so doing it here is what makes pressing play immediate.
   */
  useEffect(() => {
    if (phase !== "playing") return;
    const current = queue[cursor];
    const next = queue[cursor + 1];
    let cancelled = false;

    const preview = current?.preview;
    if (current && preview) {
      void (async () => {
        try {
          await Promise.all([engine().warm(current.id, preview), warmArt(current.art)]);
        } catch {
          // Play surfaces the failure and refreshes the link.
        }
        if (!cancelled) setReadyId(current.id);
      })();
    }

    const nextPreview = next?.preview;
    if (next && nextPreview) {
      void engine().warm(next.id, nextPreview).catch(() => undefined);
      void warmArt(next.art);
    }

    return () => {
      cancelled = true;
    };
  }, [phase, queue, cursor, warmArt]);

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
   * different song rather than the same one again. A band that answers with
   * nothing playable is dug through a few songs deep before the level settles
   * for one and lets play deal with it.
   */
  const draw = useCallback(
    async (pool: readonly Track[]): Promise<Track | null> => {
      const order = shuffle(pool).map(remembered);
      for (let i = 0; i < CANDIDATES_PER_LEVEL; i += 1) {
        const candidate = order[i];
        if (!candidate) break;
        if (candidate.preview) return candidate;
        const [hit] = await resolvePreviews([candidate]).catch(() => []);
        if (hit) {
          foundRef.current.set(hit.id, { preview: hit.preview, art: hit.art });
          return hit;
        }
      }
      return order[0] ?? null;
    },
    [remembered],
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

      // Already drawn, and its audio already fetched, while the level before it
      // was being played: arriving is a change of state and nothing else, with
      // no lookup to wait on and so no spinner to sit through.
      const ahead = aheadRef.current;
      if (ahead && ahead.level === index) {
        aheadRef.current = null;
        showQueue([ahead.track]);
        // Decoded audio means the card has nothing left to wait for, and saying
        // so here rather than an effect later is what keeps the stage from
        // blinking through Loading on its way in.
        if (engine().has(ahead.track.id)) setReadyId(ahead.track.id);
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
      })();
    },
    [draw, showQueue],
  );

  /**
   * Draw the next level's song while this one is still being played, and fetch
   * its audio too. The wait is the lookup and the download, and both of them
   * happen here, in the seconds spent guessing, rather than after the press
   * that asks for the level.
   */
  useEffect(() => {
    if (!guessable || phase !== "playing" || !playlist) return;
    const target = (level + 1) % LEVELS.length;
    if (aheadRef.current?.level === target) return;
    let cancelled = false;

    void (async () => {
      const picked = await draw(bandFor(playlist.tracks, target));
      // The level moved on while this was out looking, so this song is for a
      // step of the ladder that is no longer next.
      if (cancelled || !picked) return;
      aheadRef.current = { level: target, track: picked };
      if (picked.preview) {
        void engine()
          .warm(picked.id, picked.preview)
          .catch(() => undefined);
        void warmArt(picked.art);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guessable, phase, playlist, level, draw, warmArt]);

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
      aheadRef.current = null;
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
    if (!track || reveal) return;

    const audio = engine();
    if (playing) {
      audio.stop();
      setPlaying(false);
      return;
    }

    // Create the context inside the gesture, before any await.
    audio.ensure();
    const length = currentLength;
    setLoadingAudio(true);

    void (async () => {
      try {
        // Browsers start the context suspended and resume is async, so waiting
        // here is what stops the first press from doing nothing.
        await audio.resume();

        const preview = track.preview ?? (await resolveNow(track));
        if (!preview) {
          setError("No audio for this one.");
          setLoadingAudio(false);
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
        const offset =
          prefs.startMode === "dropin"
            ? dropInOffset(track.id, audio.duration(track.id), longest)
            : audio.onset(track.id);
        audio.play(track.id, offset, length, () => setPlaying(false));
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
      } finally {
        setLoadingAudio(false);
      }
    })();
  }, [track, reveal, playing, stages, currentLength, prefs.startMode, advance, resolveNow]);

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

  function setTheme(next: "dark" | "light") {
    document.documentElement.dataset.theme = next;
    update({ theme: next });
  }

  // Everything for this track is decoded, so play fires with no wait.
  const audioReady = track ? readyId === track.id : false;

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
      onStartMode={(next: StartMode) => update({ startMode: next })}
      onMode={setMode}
      onReroll={() => deal("random")}
      onRules={(next: Rules) => update({ rules: next })}
      onHints={setHints}
      onVolume={(v) => {
        update({ volume: v });
        engine().setVolume(v);
      }}
      onTheme={setTheme}
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

  const roundHeader = (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm text-muted">{playlist?.name}</span>

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
                    backgroundColor: `color-mix(in srgb, ${step.color} 15%, transparent)`,
                    color: step.color,
                  }),
            }}
            className="pill h-10 rounded-full px-2.5 text-[15px] font-extrabold"
          >
            {step.name}
          </button>
        );
      })}
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
    setReadyId(null);
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
                nextTone={guessable ? (LEVELS[(level + 1) % LEVELS.length]?.color ?? null) : null}
                engine={engine()}
                onNext={advance}
              />
            </div>
          ) : phase === "playing" && track ? (
            // One tree whether the audio is ready or not. The order sits above
            // the spinner rather than being replaced by it, so the control that
            // started the wait is still there to use, and the badge beside it is
            // not remounted, and restarted, the moment the wait ends.
            <div className="flex w-full max-w-lg flex-col gap-8">
              {roundHeader}
              {guessable ? levelPicker : null}

              {!audioReady ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <span className="loader h-9 w-9 rounded-full border-2 border-line" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                    Loading
                  </span>
                </div>
              ) : (
                <>
                  {hints.art && track.art ? (
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
                    disabled={false}
                    loading={loadingAudio}
                    engine={engine()}
                    onPlay={play}
                  />

                  <GuessInput
                    tracks={playlist?.tracks ?? []}
                    showArtist={mixedArtist}
                    disabled={false}
                    onGuess={guess}
                    onSkip={miss}
                    remaining={remaining}
                  />

                  <div className="flex min-h-12 flex-col items-center gap-2">
                    {error ? (
                      <span className="text-sm text-[var(--color-bad)]">{error}</span>
                    ) : hints.artist ? (
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
                </>
              )}
            </div>
          ) : phase === "loading" ? (
            // Guessable draws a level's song before showing it, and keeps the
            // picker up while it does, so the wait is still somewhere you can
            // change your mind rather than a stalled round.
            <div className="flex w-full max-w-lg flex-col gap-8">
              {guessable ? roundHeader : null}
              {guessable ? levelPicker : null}
              <div className="flex flex-col items-center gap-4 py-10">
                <span className="loader h-9 w-9 rounded-full border-2 border-line" />
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                  Dealing
                </span>
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
