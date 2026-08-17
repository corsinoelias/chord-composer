// Normalization shared by both sides of the /songs/ search: the server pre-computes each
// card's haystack into a data-search-text attribute, the client normalizes the typed query
// with the same function. It has to be the same function — the library is bilingual ("Hay
// Poder | Yeshua — Averly Morillo", "Creo en Ti"), and an accent-sensitive compare silently
// fails for everyone who types without tildes, which is most people on a phone.
//
// Punctuation collapses to spaces so the "|" and em dashes in real titles don't split a
// word away from its neighbours, and NFD + combining-mark stripping handles ñ (n + U+0303)
// as well as the accented vowels. The character class is written with escapes on purpose:
// spelled literally it is a run of invisible combining marks that any editor may mangle.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    // Sharps survive as 's' rather than being swallowed by the punctuation strip below.
    // Dropping the '#' turns the key "F#" into the single letter "f", and a one-letter
    // token substring-matches most of the catalogue: "f#m" would then score a hit on
    // "...morillo f worship" via 'f' and 'm'. "fsm" collides with nothing real.
    .replace(/#/g, 's')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every token in the query must appear somewhere in the haystack, in any order — so
// "elevation washed" finds "Washed — Elevation Rhythm". Substring rather than whole-word
// matching keeps partial typing useful ("wonderw" still matches).
export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

// Below this, a query matches so much of the catalogue that filtering is noise — and it
// also keeps a single stray keystroke from counting as a search in GA4.
export const MIN_SEARCH_LENGTH = 2;
