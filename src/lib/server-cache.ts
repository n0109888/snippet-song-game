/**
 * Process local helpers for the route handlers: a TTL map, a concurrency
 * limiter and a fetch that respects Retry-After. No database by design, so
 * these caches are lost on restart, which is fine for previews.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 5000,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
}

/** Runs tasks with a ceiling on how many are in flight at once. */
export async function mapLimit<In, Out>(
  items: readonly In[],
  limit: number,
  worker: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item, index);
    }
  });

  await Promise.all(runners);
  return results;
}

export class RateLimited extends Error {
  constructor(readonly retryAfter: number) {
    super("rate limited");
    this.name = "RateLimited";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch with a small retry. A 429 is retried once after Retry-After when that
 * wait is short, otherwise it is surfaced so the caller can report it.
 */
export async function fetchRetry(
  url: string,
  init: RequestInit = {},
  attempts = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);

      if (res.status === 429) {
        const header = Number(res.headers.get("retry-after") ?? "0");
        const waitSeconds = Number.isFinite(header) && header > 0 ? header : 1;
        if (attempt < attempts - 1 && waitSeconds <= 3) {
          await sleep(waitSeconds * 1000);
          continue;
        }
        throw new RateLimited(waitSeconds);
      }

      if (res.status >= 500 && attempt < attempts - 1) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      return res;
    } catch (err) {
      if (err instanceof RateLimited) throw err;
      lastError = err;
      if (attempt < attempts - 1) await sleep(250 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("request failed");
}
