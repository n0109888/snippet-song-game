/**
 * Web Audio playback. Snippet length is scheduled on the audio clock, never
 * with setTimeout, so a 0.01s snippet really is 0.01s. Only 30 second previews
 * are ever fetched, decoded and held in memory.
 */

type Ctor = typeof AudioContext;

function contextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class DecodeError extends Error {
  constructor(readonly trackId: string) {
    super("decode failed");
    this.name = "DecodeError";
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer>>();
  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly fetching = new Map<string, Promise<void>>();
  private playing: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private volume = 0.8;

  /** Must be called from a user gesture. Safari needs the resume as well. */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = contextCtor();
      if (!Ctx) throw new Error("no audio support");
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  has(trackId: string): boolean {
    return this.buffers.has(trackId);
  }

  duration(trackId: string): number {
    return this.buffers.get(trackId)?.duration ?? 0;
  }

  /**
   * Fetch the encoded bytes. Deliberately does not touch the AudioContext, so
   * the next track can be prefetched before the player has clicked anything.
   */
  async prefetch(trackId: string, previewUrl: string): Promise<void> {
    if (this.buffers.has(trackId) || this.raw.has(trackId)) return;
    const pending = this.fetching.get(trackId);
    if (pending) {
      await pending;
      return;
    }

    const task = (async () => {
      const res = await fetch(`/api/audio?src=${encodeURIComponent(previewUrl)}`);
      if (!res.ok) throw new DecodeError(trackId);
      const bytes = await res.arrayBuffer();
      this.raw.set(trackId, bytes);
    })();

    this.fetching.set(trackId, task);
    try {
      await task;
    } finally {
      this.fetching.delete(trackId);
    }
  }

  /**
   * Decode into an AudioBuffer, fetching first when needed. Requires a context,
   * so this only runs once the player has interacted.
   */
  async load(trackId: string, previewUrl: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(trackId);
    if (cached) return cached;

    const pending = this.inflight.get(trackId);
    if (pending) return pending;

    const task = (async () => {
      const ctx = this.ensure();
      await this.prefetch(trackId, previewUrl);
      const bytes = this.raw.get(trackId);
      if (!bytes) throw new DecodeError(trackId);

      let buffer: AudioBuffer;
      try {
        // decodeAudioData detaches its input, so hand it a copy and keep the
        // original for a possible retry.
        buffer = await ctx.decodeAudioData(bytes.slice(0));
      } catch {
        throw new DecodeError(trackId);
      }

      this.buffers.set(trackId, buffer);
      this.raw.delete(trackId);
      return buffer;
    })();

    this.inflight.set(trackId, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(trackId);
    }
  }

  stop(): void {
    if (!this.playing) return;
    const { source } = this.playing;
    this.playing = null;
    try {
      source.onended = null;
      source.stop();
    } catch {
      // Already stopped, nothing to do.
    }
  }

  /**
   * Play `duration` seconds starting at `offset`. Both ends get a short fade,
   * because at 0.01s an unramped edge is an audible click rather than a note.
   */
  play(trackId: string, offset: number, duration: number, onEnded?: () => void): void {
    const ctx = this.ensure();
    const buffer = this.buffers.get(trackId);
    const master = this.master;
    if (!buffer || !master) throw new DecodeError(trackId);

    this.stop();

    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.02)));
    const length = Math.max(0.005, Math.min(duration, buffer.duration - safeOffset));

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(master);

    // Small lead so every ramp point is scheduled in the future.
    const startAt = ctx.currentTime + 0.02;
    const endAt = startAt + length;
    const ramp = Math.min(0.005, length / 4);

    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + ramp);
    gain.gain.setValueAtTime(1, endAt - ramp);
    gain.gain.linearRampToValueAtTime(0, endAt);

    source.onended = () => {
      if (this.playing?.source === source) this.playing = null;
      onEnded?.();
    };

    source.start(startAt, safeOffset, length);
    source.stop(endAt);

    this.playing = { source, gain };
  }
}

/** Stable 32 bit hash, so a track's drop in point never moves between stages or replays. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Drop in offset for a track, derived from its id so it is identical on every
 * stage and every replay. Held between 15% and 65% of the buffer, then pulled
 * back if needed so the longest stage still fits before the end.
 */
export function dropInOffset(
  trackId: string,
  bufferDuration: number,
  longestStage: number,
): number {
  if (bufferDuration <= 0) return 0;
  const fraction = 0.15 + (hash(trackId) % 1000) / 1000 * 0.5;
  const wanted = bufferDuration * fraction;
  const latest = Math.max(0, bufferDuration - longestStage);
  return Math.max(0, Math.min(wanted, latest));
}
