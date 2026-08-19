"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Confetti, MissFlash } from "./Effects";
import GuessInput from "./GuessInput";
import PresetPicker from "./PresetPicker";
import Reveal from "./Reveal";
import Settings from "./Settings";
import SourcePicker from "./SourcePicker";
import Stage from "./Stage";
import Summary, { ResultsList, type RoundResult } from "./Summary";
import { AudioEngine, DecodeError, dropInOffset } from "@/lib/audio";
import {
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  pickRound,
  type DifficultyName,
  type Rules,
} from "@/lib/difficulty";
import { parsePastedLines, parsePlaylistLink } from "@/lib/links";
import { titleMatches } from "@/lib/normalize";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "@/lib/storage";
import {
  accessToken,
  beginLogin,
  clientId,
  completeLogin,
  readToken,
  signOut,
} from "@/lib/spotify-pkce";
import {
  isApiError,
  type LoadedPlaylist,
  type PresetCollection,
  type RawTrack,
  type StartMode,
  type Track,
} from "@/lib/types";
import presetData from "../../data/preset-playlist.json";

type Mode = "preset" | "custom";
type Phase = "setup" | "loading" | "playing" | "done";

interface RevealState {
  solved: boolean;
  track: Track;
  atLength: number | null;
}

/** How many upcoming tracks to keep preview-resolved ahead of the player. */
const LOOKAHEAD = 4;

const COLLECTIONS = (presetData as { collections?: PresetCollection[] }).collections ?? [];

export default function Game() {
  const engineRef = useRef<AudioEngine | null>(null);
  const revealTimer = useRef<number | null>(null);
  const queueRef = useRef<Track[]>([]);
  const resolvingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [mode, setMode] = useState<Mode>("preset");

  const [phase, setPhase] = useState<Phase>("setup");
  const [playlist, setPlaylist] = useState<LoadedPlaylist | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [cursor, setCursor] = useState(0);
  const [misses, setMisses] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [playing, setPlaying] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [presetBusy, setPresetBusy] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [missKey, setMissKey] = useState(0);
  const [showResults, setShowResults] = useState(false);

  const rules = prefs.rules;
  const stages = rules.stages;
  const stageIndex = Math.min(misses, stages.length - 1);
  const track = queue[cursor];
  const maxMisses = Math.min(rules.guesses, stages.length);
  const remaining = maxMisses - misses;

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
    setSignedIn(readToken() !== null);
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
    if (resolvingRef.current) return;
    const pending = queueRef.current
      .slice(from, from + LOOKAHEAD)
      .filter((t) => t.preview === null);
    if (pending.length === 0) return;

    resolvingRef.current = true;
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracks: pending }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tracks?: Track[] };
      const found = new Map((data.tracks ?? []).map((t) => [t.id, t]));

      const next = queueRef.current.map((t) => {
        const hit = found.get(t.id);
        return hit ? { ...t, preview: hit.preview, art: t.art ?? hit.art } : t;
      });
      // Tracks the lookup could not match are dropped rather than left silent.
      const attempted = new Set(pending.map((t) => t.id));
      queueRef.current = next.filter(
        (t, i) => i <= from || t.preview !== null || !attempted.has(t.id),
      );
      setQueue(queueRef.current);
    } catch {
      // Leave the queue as it is, the player can skip past a bad track.
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    void topUp(cursor);
  }, [phase, cursor, topUp]);

  // Warm the bytes for the current and next track once they have a preview.
  useEffect(() => {
    if (phase !== "playing") return;
    for (const t of [queue[cursor], queue[cursor + 1]]) {
      if (t?.preview) void engine().prefetch(t.id, t.preview).catch(() => undefined);
    }
  }, [phase, queue, cursor]);

  const startRound = useCallback(
    (loaded: LoadedPlaylist, difficulty: DifficultyName, useBands: boolean) => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      engineRef.current?.stop();
      const drawn = useBands
        ? pickRound(loaded.tracks, difficulty, loaded.tracks.length)
        : [...loaded.tracks].sort(() => Math.random() - 0.5);
      queueRef.current = drawn;
      setQueue(drawn);
      setCursor(0);
      setMisses(0);
      setResults([]);
          setReveal(null);
      setPlaying(false);
      setError(null);
      setPhase("playing");
    },
    [],
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
      }));

      if (tracks.length === 0) {
        setError("That playlist has no playable tracks.");
        setPhase("setup");
        return null;
      }

      const loaded: LoadedPlaylist = { name, source, sourceId, tracks };
      setPlaylist(loaded);
      update({ lastSource: source, lastSourceId: sourceId });
      return loaded;
    },
    [update],
  );

  const loadLink = useCallback(
    async (value: string) => {
      setError(null);
      setNotice(null);

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("Offline.");
        return;
      }

      const parsed = parsePlaylistLink(value);
      if (!parsed) {
        setError("That link is not a playlist.");
        return;
      }

      setPhase("loading");

      const headers: Record<string, string> = {};
      if (parsed.kind === "spotify") {
        if (!clientId()) {
          setError("Spotify client id is not configured.");
          setPhase("setup");
          return;
        }
        const token = await accessToken();
        if (!token) {
          setPhase("setup");
          await beginLogin(value);
          return;
        }
        headers.authorization = `Bearer ${token}`;
      }

      const res = await fetch(`/api/playlist?source=${parsed.kind}&id=${parsed.id}`, { headers });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok || !data) {
        if (isApiError(data) && data.code === "unauthorized") {
          signOut();
          setSignedIn(false);
        }
        setError(isApiError(data) ? data.error : "Could not load that playlist.");
        setPhase("setup");
        return;
      }

      const payload = data as { name?: string; tracks?: RawTrack[] };
      const loaded = loadTracks(
        payload.tracks ?? [],
        payload.name ?? "Playlist",
        parsed.kind,
        parsed.id,
      );
      // Custom playlists are the player's own, so no popularity banding.
      if (loaded) startRound(loaded, prefs.difficulty, false);
    },
    [loadTracks, startRound, prefs.difficulty],
  );

  const loadPasted = useCallback(
    async (text: string) => {
      setError(null);
      setNotice(null);
      const lines = parsePastedLines(text);
      if (lines.length === 0) {
        setError("Use one Artist - Title per line.");
        return;
      }
      const raw: RawTrack[] = lines.map((line, i) => ({
        id: `paste:${i}:${line.artist}:${line.title}`,
        title: line.title,
        artist: line.artist,
        art: null,
        link: null,
      }));
      const loaded = loadTracks(raw, "Pasted", "paste", "pasted");
      if (loaded) startRound(loaded, prefs.difficulty, false);
    },
    [loadTracks, startRound, prefs.difficulty],
  );

  const startPreset = useCallback(
    (collection: PresetCollection) => {
      setError(null);
      setNotice(null);
      setPresetBusy(collection.id);
      const loaded = loadTracks(
        collection.tracks as RawTrack[],
        collection.name,
        "preset",
        collection.id,
      );
      if (loaded) startRound(loaded, prefs.difficulty, true);
      setPresetBusy(null);
    },
    [loadTracks, startRound, prefs.difficulty],
  );

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const result = await completeLogin();
      if (!result) return;
      setSignedIn(readToken() !== null);
      if (!result.ok) {
        setError("Spotify sign in failed.");
        return;
      }
      setMode("custom");
      if (result.returnTo) await loadLink(result.returnTo);
    })();
  }, [ready, loadLink]);

  const advance = useCallback(() => {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    engineRef.current?.stop();
    setPlaying(false);
    setReveal(null);
    setMisses(0);
    setCursor((c) => {
      const next = c + 1;
      if (next >= queueRef.current.length) {
        setPhase("done");
        return c;
      }
      return next;
    });
  }, []);

  const finishTrack = useCallback(
    (solved: boolean, solvedAt: number | null) => {
      const current = queueRef.current[cursor];
      if (!current) return;
      engineRef.current?.stop();
      setPlaying(false);
      setResults((r) => [...r, { track: current, solvedAt }]);
      setReveal({
        solved,
        track: current,
        atLength: solvedAt === null ? null : (stages[solvedAt] ?? null),
      });
      if (solved) setConfettiKey((k) => k + 1);
      else setMissKey((k) => k + 1);
    },
    [cursor, stages],
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
    if (!track?.preview || reveal) return;
    const preview = track.preview;

    const audio = engine();
    if (playing) {
      audio.stop();
      setPlaying(false);
      return;
    }

    audio.ensure();
    const length = stages[stageIndex] ?? 1;

    void (async () => {
      try {
        await audio.load(track.id, preview);
        const longest = Math.max(...stages);
        const offset =
          prefs.startMode === "dropin"
            ? dropInOffset(track.id, audio.duration(track.id), longest)
            : audio.onset(track.id);
        audio.play(track.id, offset, length, () => setPlaying(false));
        setPlaying(true);
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
  }, [track, reveal, playing, stages, stageIndex, prefs.startMode, advance]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape" && (sheetOpen || showResults)) {
        setSheetOpen(false);
        setShowResults(false);
        return;
      }
      if (typing || phase !== "playing") return;

      if (event.code === "Space") {
        event.preventDefault();
        if (reveal) advance();
        else play();
        return;
      }
      if (event.key === "s" || event.key === "S") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        if (!reveal) miss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, reveal, sheetOpen, showResults, play, miss, advance]);

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

  const artBlur = useMemo(() => {
    if (!rules.artHint) return 0;
    const steps = Math.max(1, stages.length - 1);
    return Math.round(24 * (1 - stageIndex / steps));
  }, [rules.artHint, stages.length, stageIndex]);

  const showArtist = rules.artistAfter !== null && misses >= rules.artistAfter;

  const settingsPanel = (
    <Settings
      rules={rules}
      startMode={prefs.startMode}
      volume={prefs.volume}
      theme={prefs.theme}
      onStartMode={(next: StartMode) => update({ startMode: next })}
      onRules={(next: Rules) => update({ rules: next })}
      onVolume={(v) => {
        update({ volume: v });
        engine().setVolume(v);
      }}
      onTheme={setTheme}
    />
  );

  function leaveRound() {
    engineRef.current?.stop();
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    setPlaying(false);
    setReveal(null);
    setPhase(results.length > 0 ? "done" : "setup");
  }

  return (
    <div className="flex h-dvh flex-col">
      <Confetti fireKey={confettiKey} />
      <MissFlash fireKey={missKey} />

      <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-sm uppercase tracking-[0.14em]">Snippet</span>

        <div className="flex items-center gap-2">
          {(["preset", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setPhase("setup");
                setPlaylist(null);
                setError(null);
                setNotice(null);
                setResults([]);
                engineRef.current?.stop();
                setPlaying(false);
              }}
              className={`h-8 rounded-chip border px-3 text-xs transition-colors duration-150 ease-out ${
                mode === m
                  ? "border-line-strong text-ink"
                  : "border-transparent text-faint hover:text-muted"
              }`}
            >
              {m === "preset" ? "Preset" : "Custom"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-6">
          {!ready ? null : phase === "done" ? (
            <Summary
              results={results}
              stageCount={stages.length}
              onAgain={() => {
                if (playlist) startRound(playlist, prefs.difficulty, mode === "preset");
                else setPhase("setup");
              }}
              onExit={() => setPhase("setup")}
            />
          ) : phase === "playing" && reveal ? (
            <Reveal
              track={reveal.track}
              solved={reveal.solved}
              atLength={reveal.atLength}
              engine={engine()}
              onNext={advance}
            />
          ) : phase === "playing" && track ? (
            <div className="flex w-full max-w-lg flex-col gap-8">
              <div className="flex items-end justify-between gap-4">
                {mode === "preset" ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {DIFFICULTY_NAMES.map((name) => {
                      const selected = prefs.difficulty === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            update({ difficulty: name });
                            if (playlist) startRound(playlist, name, true);
                          }}
                          style={selected ? { borderColor: DIFFICULTIES[name].accent } : undefined}
                          className={`h-7 rounded-chip border px-2 text-xs transition-colors duration-150 ease-out ${
                            selected ? "text-ink" : "border-transparent text-faint hover:text-muted"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="truncate text-sm text-muted">{playlist?.name}</span>
                )}

                <div className="flex shrink-0 items-end gap-5">
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                      Correct
                    </span>
                    <span className="font-mono text-lg leading-none tabular-nums">
                      {results.filter((r) => r.solvedAt !== null).length}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                      Song
                    </span>
                    <span className="font-mono text-lg leading-none tabular-nums">
                      {results.length + 1}
                    </span>
                  </div>
                </div>
              </div>

              {rules.artHint && track.art ? (
                <div className="flex justify-center">
                  <div className="h-28 w-28 overflow-hidden rounded-panel border border-line">
                    <Image
                      src={track.art}
                      alt=""
                      width={112}
                      height={112}
                      unoptimized
                      style={{ filter: `blur(${artBlur}px)`, transform: "scale(1.15)" }}
                      className="h-full w-full object-cover transition-[filter] duration-150 ease-out"
                    />
                  </div>
                </div>
              ) : null}

              <Stage
                stages={stages}
                unlocked={stageIndex}
                playing={playing}
                disabled={!track.preview}
                accent={DIFFICULTIES[prefs.difficulty].accent}
                onPlay={play}
              />

              <GuessInput
                tracks={playlist?.tracks ?? []}
                disabled={false}
                onGuess={guess}
                onSkip={miss}
                remaining={remaining}
              />

              <div className="flex min-h-10 items-center justify-between gap-3">
                {error ? (
                  <span className="text-sm text-[var(--color-bad)]">{error}</span>
                ) : showArtist ? (
                  <span className="text-sm text-muted">{track.artist}</span>
                ) : (
                  <span />
                )}
                <div className="flex shrink-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setShowResults(true)}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition-colors duration-150 ease-out hover:text-muted"
                  >
                    Results
                  </button>
                  <button
                    type="button"
                    onClick={leaveRound}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition-colors duration-150 ease-out hover:text-muted"
                  >
                    End
                  </button>
                </div>
              </div>
            </div>
          ) : phase === "loading" ? (
            <span className="font-mono text-xs text-faint">Loading</span>
          ) : mode === "preset" ? (
            <PresetPicker collections={COLLECTIONS} busy={presetBusy} onStart={startPreset} />
          ) : (
            <SourcePicker
              busy={false}
              signedIn={signedIn}
              error={error}
              notice={notice}
              onLoadLink={(v) => void loadLink(v)}
              onLoadPasted={(v) => void loadPasted(v)}
              onSignIn={() => {
                if (!clientId()) {
                  setError("Spotify client id is not configured.");
                  return;
                }
                void beginLogin("");
              }}
              onSignOut={() => {
                signOut();
                setSignedIn(false);
              }}
            />
          )}
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
                This round
              </span>
              <span className="font-mono text-sm tabular-nums">
                {results.filter((r) => r.solvedAt !== null).length}/{results.length}
              </span>
            </div>
            <ResultsList results={results} stageCount={stages.length} />
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
