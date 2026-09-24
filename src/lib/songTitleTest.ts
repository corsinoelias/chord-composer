// A/B test of the song page <title>, started 2026-09-24.
//
// "{Title} Chords in Any Key — {Artist}" (f5c81fd, 2026-09-05) left CTR unchanged at a
// matched position, but the song pages lost ~0.5 positions on the same queries while the
// rest of the site gained ~1.2, and no competitor puts "key" in a title. The two arms:
//
//   A  "{Title} Chords & Lyrics — {Artist}"   the title they ranked better with
//   B  "{Title} Chords — {Artist}"            the market's plain format
//
// Songs were ranked by Search Console impressions (28 days to 2026-09-22) and dealt
// A, B, B, A, A, B, B, A… so both arms hold big and small pages (A 84.8k impressions,
// B 80.4k). A song not listed here — new or community songs — gets B and is not part of
// the reading. Read it with matched page+query pairs at the same position, never raw CTR.
export const TITLE_TEST_STARTED = '2026-09-24';

export const TITLE_TEST_A = new Set([
  'oceans-hillsong-united',
  'goodness-of-god-bethel-music',
  'great-are-you-lord-all-sons-daughters',
  'amazing-chords-elevation-rhythm-josiah-queen',
  'goodbye-yesterday-elevation-rhythm',
  'nothing-is-impossible-planetshakers',
  'welcome-home-elevation-rhythm-seu-worship',
  'friend-of-god-israel-and-new-breed',
  'this-is-amazing-grace-phil-wickham',
  'good-good-father-chris-tomlin',
  'the-blood-bethel-music',
  'build-my-life-pat-barrett',
  'i-speak-jesus-charity-gayle',
  'hello-adele',
  'thank-god-im-free-elevation-rhythm',
  'owe-you-praise-feat-chandler-moore-elevation-worship',
  'promises-maverick-city-music',
  'king-of-kings-hillsong-worship',
  'perfect-ed-sheeran',
  'god-im-just-grateful-elevation-worship',
  'worthy-elevation-worship',
  'heart-of-worship-matt-redman',
  'hallelujah-leonard-cohen',
  'you-are-good-israel-and-new-breed',
  'broken-vessels-amazing-grace-hillsong-worship',
  'you-made-a-way-travis-greene',
  'spirit-break-out-kim-walker',
  'show-me-your-face-upperroom',
]);

export const TITLE_TEST_B = new Set([
  'washed-elevation-rhythm',
  'center-bethel-music',
  'jesus-be-the-name-elevation-worship',
  'holy-forever-chris-tomlin',
  'no-one-like-the-lord-bethel-music',
  'alleluia-elevation-worship',
  'i-want-jesus-william-mcdowell',
  'so-will-i-100-billion-x-hillsong-united',
  'joy-chandler-moore',
  'yet-dont-give-up-maverick-city-music',
  'wonderwall-oasis',
  'hay-poder-yeshua-averly-morillo',
  'for-christ-alone-2819-worship',
  'counting-my-blessings-seph-schlueter',
  'trust-in-you-lauren-daigle',
  'what-a-beautiful-name-hillsong-worship',
  'glory-arise-seu-worship-grace-shuffitt',
  'way-maker-leeland',
  'always-on-time-elevation-worship',
  'you-are-the-one-new-creation-worship',
  '10000-reasons-matt-redman',
  'holy-spirit-you-are-welcome-here-jesus-culture',
  'open-the-eyes-of-my-heart-michael-w-smith',
  'praise-elevation-worship',
  'gratitude-brandon-lake',
  'creo-en-ti-julio-melgar',
  'our-god-chris-tomlin',
  'what-a-god-seu-worship',
  'to-worship-you-i-live-israel-and-new-breed',
  'yo-soy-la-ofrenda-montesanto',
]);

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'to', 'for', 'by', 'at', 'as', 'x']);

// The catalogue stores names as they were typed ("WASHED", "ELEVATION RHYTHM",
// "Jesus be the Name"). In a result list an all-caps or half-capitalised title reads as
// spam next to "Washed Chords - Elevation Rhythm". A name that is ENTIRELY upper case is
// title-cased; otherwise only lower-case words are raised, so stylings like
// "for KING & COUNTRY", "SEU Worship" or "UPPERROOM" inside a mixed name survive.
export function titleCaseName(name: string): string {
  const s = name.trim().replace(/\s+\|\s+/g, ' / ');
  const allCaps = /[A-Z]/.test(s) && s === s.toUpperCase();
  const base = allCaps ? s.toLowerCase() : s;
  return base.replace(/[\p{L}\p{N}'’]+/gu, (w, offset: number) => {
    if (!/^\p{Ll}/u.test(w)) return w;
    if (offset > 0 && SMALL_WORDS.has(w) && !/[(/]\s*$/.test(base.slice(0, offset))) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}
