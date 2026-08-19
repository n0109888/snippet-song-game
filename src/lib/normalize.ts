/**
 * Title and artist normalisation, shared by autocomplete, guess matching and
 * preview lookup verification. Matching has to be forgiving about release
 * suffixes but strict about the actual song, otherwise a wrong preview gets
 * accepted and the round is unwinnable.
 */

const NOISE_WORDS = [
  "remaster",
  "remastered",
  "remastering",
  "live",
  "radio edit",
  "single version",
  "single edit",
  "album version",
  "original version",
  "original mix",
  "mono",
  "stereo",
  "deluxe",
  "bonus track",
  "bonus",
  "extended",
  "edit",
  "version",
  "explicit",
  "clean",
  "anniversary",
  "edition",
  "reissue",
  "digital",
  "expanded",
  "from the motion picture",
  "soundtrack version",
];

const YEAR = /\b(19|20)\d{2}\b/g;

/** True when a bracketed or dashed suffix is a release annotation, not part of the title. */
function isNoiseSegment(segment: string): boolean {
  const s = segment.trim().toLowerCase().replace(YEAR, "").trim();
  if (!s) return true;
  if (/^(feat|ft|featuring|with)\b/.test(s)) return true;
  return NOISE_WORDS.some((w) => s.includes(w));
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Remove `(feat. X)`, `[Live]`, `- Remastered 2011` and similar trailing annotations. */
function stripAnnotations(s: string): string {
  let out = s;

  // Bracketed groups that are release annotations.
  out = out.replace(/[([{]([^)\]}]*)[)\]}]/g, (full, inner: string) =>
    isNoiseSegment(inner) ? " " : full,
  );

  // Dash separated trailing segments, e.g. "Song - Remastered 2011".
  const parts = out.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    const kept = [parts[0] ?? ""];
    for (const part of parts.slice(1)) {
      if (!isNoiseSegment(part)) kept.push(part);
    }
    out = kept.join(" ");
  }

  // Bare "feat." with no brackets, runs to the end.
  out = out.replace(/\b(feat|ft|featuring)\.?\s.*$/i, " ");

  return out;
}

export function normalize(input: string): string {
  let s = stripDiacritics(input.toLowerCase());
  s = s.replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"');
  s = stripAnnotations(s);
  s = s.replace(/&/g, " and ");
  // Apostrophes vanish rather than split, so "don't" and "dont" agree.
  s = s.replace(/'/g, "");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Primary artist only, so "A, B & C" and "A" compare equal. */
export function normalizeArtist(input: string): string {
  const primary = input.split(/\s*(?:,|&|feat\.?|ft\.?|featuring|x|\/)\s+/i)[0] ?? input;
  return normalize(primary);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** A guess counts when the normalised titles match exactly, or are within 2 edits for longer titles. */
export function titleMatches(guess: string, answer: string): boolean {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  if (a.length > 6 && levenshtein(g, a) <= 2) return true;
  return false;
}

/**
 * Verification for preview lookup. Stricter than a guess: a candidate is only
 * accepted when the artist agrees and the title is a close match, so a search
 * that drifts to a different song is rejected.
 */
export function isSameRecording(
  candidate: { title: string; artist: string },
  want: { title: string; artist: string },
): boolean {
  const ct = normalize(candidate.title);
  const wt = normalize(want.title);
  if (!ct || !wt) return false;

  const titleOk =
    ct === wt ||
    (wt.length > 6 && levenshtein(ct, wt) <= 2) ||
    (wt.length > 10 && (ct.startsWith(wt) || wt.startsWith(ct)));
  if (!titleOk) return false;

  const ca = normalizeArtist(candidate.artist);
  const wa = normalizeArtist(want.artist);
  if (!ca || !wa) return false;
  return (
    ca === wa ||
    ca.includes(wa) ||
    wa.includes(ca) ||
    (wa.length > 5 && levenshtein(ca, wa) <= 2)
  );
}
