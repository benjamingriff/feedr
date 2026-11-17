export interface NameMatch {
  /** Character range in the text, end exclusive. */
  start: number;
  end: number;
  /** Index into the names that were passed in. */
  index: number;
}

/** Reduces a word to a rough singular so "onions", "tomatoes" and "berries" match their singular. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(oes|ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function words(text: string) {
  return [...text.matchAll(/\p{L}+/gu)].map((m) => ({ start: m.index, end: m.index + m[0].length, stem: stem(m[0]) }));
}

/**
 * Finds where ingredient names appear in a step's text, for marking terms in the method and
 * cook mode. Matching ignores case and plurals. A name matches as a whole ("curry powder"),
 * by its last word ("basmati rice" → "rice") or, when the ingredient isn't found any other
 * way, by its first word ("chicken breasts" → "chicken"). Whole names win over single words.
 * A word two names could claim equally ("chicken" with both chicken stock and chicken
 * breasts, or "butter" when two lines are both butter) is left unmarked. Ranges never overlap and come back in text order.
 */
export function matchIngredientNames(text: string, names: string[]): NameMatch[] {
  const tokens = words(text);
  const candidates: (NameMatch & { rank: number })[] = [];

  names.forEach((name, index) => {
    const stems = words(name).map((w) => w.stem);
    if (!stems.length) return;
    tokens.forEach((token, t) => {
      const whole = stems.every(
        (s, i) =>
          tokens[t + i]?.stem === s && (i === 0 || /^[\s-]+$/.test(text.slice(tokens[t + i - 1]!.end, tokens[t + i]!.start))),
      );
      if (whole) candidates.push({ start: token.start, end: tokens[t + stems.length - 1]!.end, index, rank: 0 });
      if (stems.length < 2 || token.stem.length < 3) return;
      if (token.stem === stems.at(-1)) candidates.push({ start: token.start, end: token.end, index, rank: 1 });
      else if (token.stem === stems[0]) candidates.push({ start: token.start, end: token.end, index, rank: 2 });
    });
  });

  candidates.sort((a, b) => a.rank - b.rank || b.end - b.start - (a.end - a.start) || a.index - b.index || a.start - b.start);
  const ambiguous = (c: (typeof candidates)[number]) =>
    candidates.some((o) => o.rank === c.rank && o.start === c.start && o.end === c.end && o.index !== c.index);
  const taken: (NameMatch & { rank: number })[] = [];
  for (const c of candidates) {
    if (ambiguous(c)) continue;
    if (c.rank === 2 && taken.some((m) => m.index === c.index && m.rank < 2)) continue;
    if (taken.some((m) => c.start < m.end && m.start < c.end)) continue;
    taken.push(c);
  }
  return taken.sort((a, b) => a.start - b.start).map(({ start, end, index }) => ({ start, end, index }));
}
