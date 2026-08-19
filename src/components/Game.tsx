"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import GuessInput from "./GuessInput";
import Settings from "./Settings";
import SourcePicker from "./SourcePicker";
import Reveal from "./Reveal";
import Stage from "./Stage";
import Summary, { type RoundResult } from "./Summary";
import { AudioEngine, DecodeError, dropInOffset } from "@/lib/audio";
import {
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  ROUND_LENGTH,
  labelFor,
  scoreFor,
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
import { isApiError, type LoadedPlaylist, type RawTrack, type StartMode, type Track } from "@/lib/types";
import presetPlaylist from "../../data/preset-playlist.json";

type Mode = "preset" | "custom";
type Phase = "setup" | "loading" | "playing" | "done";

interface RevealState {
  solved: boolean;
  track: Track;
  /** Snippet length it was solved at, null when missed. */
  atLength: number | null;
}

const REVEAL_MS = 2400;

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

export default function Game() {
  const engineRef = useRef<AudioEngine | null>(null);
  const revealTimer = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [mode, setMode] = useState<Mode>("preset");

  const [phase, setPhase] = useState<Phase>("setup");
  const [playlist, setPlaylist] = useState<LoadedPlaylist | null>(null);
  const [order, setOrder] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [playing, setPlaying] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const rules = prefs.rules;
  const stages = rules.stages;
  const stageIndex = Math.min(misses, stages.length - 1);
  const track = order[index];
  const difficultyLabel = labelFor(rules, prefs.startMode);
  const maxMisses = Math.min(rules.guesses, stages.length);

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

  // Restore preferences before the interactive panel paints, so no default
  // values are ever shown first.
  useEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    setSignedIn(readToken() !== null);
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

  const loadTracks = useCallback(
    async (raw: RawTrack[], name: string, source: LoadedPlaylist["source"], sourceId: string) => {
      if (raw.length === 0) {
        setError("That playlist has no playable tracks.");
        setPhase("setup");
        return;
      }

      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracks: raw }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError(isApiError(data) ? data.error : "Preview lookup failed.");
        setPhase("setup");
        return;
      }

      const payload = data as { tracks?: Track[]; skipped?: number };
      const tracks = (payload.tracks ?? []).filter((t) => Boolean(t.preview));

      if (tracks.length === 0) {
        setError("No audio found for these tracks.");
        setPhase("setup");
        return;
      }

      const skipped = payload.skipped ?? 0;
      setNotice(
        skipped > 0
          ? `${skipped} track${skipped === 1 ? "" : "s"} had no audio and ${
              skipped === 1 ? "was" : "were"
            } skipped.`
          : null,
      );

      const loaded: LoadedPlaylist = { name, source, sourceId, tracks, skipped };
      setPlaylist(loaded);
      update({ lastSource: source, lastSourceId: sourceId });
      startRound(loaded);
    },
    [update],
  );

  function startRound(loaded: LoadedPlaylist) {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    engineRef.current?.stop();
    setOrder(shuffle(loaded.tracks).slice(0, ROUND_LENGTH));
    setIndex(0);
    setMisses(0);
    setResults([]);
    setScore(0);
    setStreak(0);
    setReveal(null);
    setPlaying(false);
    setError(null);
    setPhase("playing");
  }

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
      await loadTracks(payload.tracks ?? [], payload.name ?? "Playlist", parsed.kind, parsed.id);
    },
    [loadTracks],
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
      setPhase("loading");
      const raw: RawTrack[] = lines.map((line, i) => ({
        id: `paste:${i}:${line.artist}:${line.title}`,
        title: line.title,
        artist: line.artist,
        art: null,
        link: null,
      }));
      await loadTracks(raw, "Pasted", "paste", "pasted");
    },
    [loadTracks],
  );

  const loadPreset = useCallback(async () => {
    setError(null);
    setNotice(null);
    const preset = presetPlaylist as { name?: string; tracks?: RawTrack[] };
    const tracks = preset.tracks ?? [];
    if (tracks.length === 0) return;
    setPhase("loading");
    await loadTracks(tracks, preset.name ?? "Preset", "preset", "preset");
  }, [loadTracks]);

  // Finish a Spotify redirect and resume whatever was being loaded.
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

  // Keep the current and next track's audio warm. Bytes only, so this never
  // creates an AudioContext ahead of a gesture.
  useEffect(() => {
    if (phase !== "playing") return;
    const current = order[index];
    const next = order[index + 1];
    for (const t of [current, next]) {
      if (t) void engine().prefetch(t.id, t.preview).catch(() => undefined);
    }
  }, [phase, order, index]);

  const advance = useCallback(() => {
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    engineRef.current?.stop();
    setPlaying(false);
    setReveal(null);
    setMisses(0);
    setIndex((i) => {
      const next = i + 1;
      if (next >= order.length) {
        setPhase("done");
        return i;
      }
      return next;
    });
  }, [order.length]);

  const finishTrack = useCallback(
    (solved: boolean, solvedAt: number | null) => {
      const current = order[index];
      if (!current) return;
      engineRef.current?.stop();
      setPlaying(false);
      setResults((r) => [...r, { track: current, solvedAt }]);
      setReveal({
        solved,
        track: current,
        atLength: solvedAt === null ? null : (stages[solvedAt] ?? null),
      });
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(advance, REVEAL_MS);
    },
    [order, index, advance, stages],
  );

  const miss = useCallback(() => {
    if (reveal || phase !== "playing") return;
    const next = misses + 1;
    if (next >= maxMisses) {
      setStreak(0);
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
        setScore((s) => s + scoreFor(stageIndex, rules, streak));
        setStreak((s) => s + 1);
        finishTrack(true, stageIndex);
      } else {
        miss();
      }
    },
    [track, reveal, phase, stageIndex, rules, streak, finishTrack, miss],
  );

  const play = useCallback(() => {
    if (!track || reveal) return;

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
        await audio.load(track.id, track.preview);
        const longest = Math.max(...stages);
        const offset =
          prefs.startMode === "dropin"
            ? dropInOffset(track.id, audio.duration(track.id), longest)
            : 0;
        audio.play(track.id, offset, length, () => setPlaying(false));
        setPlaying(true);
      } catch (err) {
        setPlaying(false);
        if (err instanceof DecodeError) {
          // One bad track must not end the round.
          setError("One track would not play. Skipped.");
          miss();
        } else {
          setError("Playback failed.");
        }
      }
    })();
  }, [track, reveal, playing, stages, stageIndex, prefs.startMode, miss]);

  // Keyboard control. Typing in a field always wins.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape" && sheetOpen) {
        setSheetOpen(false);
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
  }, [phase, reveal, sheetOpen, play, miss, advance]);

  useEffect(() => {
    function offline() {
      setError("Offline.");
    }
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);

  function pickDifficulty(name: DifficultyName) {
    const next = DIFFICULTIES[name];
    update({
      difficulty: name,
      rules: next,
      startMode: next.forceDropIn ? "dropin" : prefs.startMode,
    });
  }

  function setRules(next: Rules) {
    update({ rules: next });
  }

  function setStartMode(next: StartMode) {
    if (rules.forceDropIn && next === "start") return;
    update({ startMode: next });
  }

  const presetEmpty = (presetPlaylist as { tracks?: unknown[] }).tracks?.length === 0;

  const settingsPanel = (
    <Settings
      rules={rules}
      startMode={prefs.startMode}
      volume={prefs.volume}
      onStartMode={setStartMode}
      onRules={setRules}
      onVolume={(v) => {
        update({ volume: v });
        engine().setVolume(v);
      }}
    />
  );

  const artBlur = useMemo(() => {
    if (!rules.artHint) return 0;
    const steps = Math.max(1, stages.length - 1);
    return Math.round(24 * (1 - stageIndex / steps));
  }, [rules.artHint, stages.length, stageIndex]);

  const showArtist = rules.artistAfter !== null && misses >= rules.artistAfter;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-sm tracking-[0.14em] uppercase">Snippet</span>

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
                engineRef.current?.stop();
                setPlaying(false);
                if (m === "preset" && !presetEmpty) void loadPreset();
              }}
              className={`h-8 rounded-chip border px-3 text-xs transition-colors duration-150 ease-out ${
                mode === m ? "border-line-strong text-ink" : "border-transparent text-faint hover:text-muted"
              }`}
            >
              {m === "preset" ? "Preset" : "Custom"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 items-center justify-center px-5 py-6">
          {!ready ? null : phase === "done" ? (
            <Summary
              results={results}
              score={score}
              stageCount={stages.length}
              onAgain={() => playlist && startRound(playlist)}
            />
          ) : phase === "playing" && reveal ? (
            <Reveal track={reveal.track} solved={reveal.solved} atLength={reveal.atLength} />
          ) : phase === "playing" && track ? (
            <div className="flex w-full max-w-lg flex-col gap-8">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1">
                  {DIFFICULTY_NAMES.map((name) => {
                    const selected = difficultyLabel === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => pickDifficulty(name)}
                        style={selected ? { borderColor: DIFFICULTIES[name].accent } : undefined}
                        className={`h-7 rounded-chip border px-2 text-xs transition-colors duration-150 ease-out ${
                          selected ? "text-ink" : "border-transparent text-faint hover:text-muted"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                  {difficultyLabel === "Custom" ? (
                    <span className="ml-1 text-xs text-faint">Custom</span>
                  ) : null}
                </div>
                <span className="shrink-0 whitespace-nowrap font-mono text-xs text-faint tabular-nums">
                  {score} · {index + 1}/{order.length}
                </span>
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
                disabled={false}
                accent={rules.accent}
                onPlay={play}
              />

              <GuessInput
                tracks={playlist?.tracks ?? []}
                disabled={false}
                onGuess={guess}
                onSkip={miss}
                remaining={maxMisses - misses}
              />

              <div className="min-h-10">
                {showArtist ? (
                  <span className="text-sm text-muted">{track.artist}</span>
                ) : error ? (
                  <span className="text-sm text-[var(--color-bad)]">{error}</span>
                ) : null}
              </div>
            </div>
          ) : phase === "loading" ? (
            <span className="font-mono text-xs text-faint">Loading</span>
          ) : mode === "preset" ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm text-muted">{presetEmpty ? "No songs" : "Ready"}</span>
              {!presetEmpty ? (
                <button
                  type="button"
                  onClick={() => void loadPreset()}
                  className="h-10 rounded-control border border-line-strong px-4 text-sm transition-colors duration-150 ease-out hover:bg-[rgba(255,255,255,0.05)]"
                >
                  Start
                </button>
              ) : null}
              {error ? <span className="text-sm text-[var(--color-bad)]">{error}</span> : null}
            </div>
          ) : (
            <SourcePicker
              busy={false}
              signedIn={signedIn}
              error={error}
              notice={notice}
              onLoadLink={(v) => void loadLink(v)}
              onLoadPasted={(v) => void loadPasted(v)}
              onSignIn={() => void beginLogin("")}
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
