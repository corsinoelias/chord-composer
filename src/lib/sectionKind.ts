// What kind of section a song section is, read from its name, and the colours each kind wears
// on the song page (Sep 2026 redesign): verses teal, choruses violet, bridges orange, pre-choruses
// sky, everything else slate. The same colour follows a section through the song map, the chart
// headers and the playback bar's timeline, so "the orange one" means the bridge everywhere.
//
// Names come from the catalogue (English) and from community songs (often Spanish), so both are
// recognised. Anything unrecognised is 'other' and still gets a short label.

export type SectionKind = 'verse' | 'pre' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'other';

export function sectionKind(name: string): SectionKind {
  const n = name.toLowerCase();
  if (/pre[\s-]?(chorus|coro|estribillo)/.test(n)) return 'pre';
  if (/chorus|coro|estribillo|refr[aá]n/.test(n)) return 'chorus';
  if (/verse|verso|estrofa/.test(n)) return 'verse';
  if (/bridge|puente/.test(n)) return 'bridge';
  if (/intro/.test(n)) return 'intro';
  if (/outro|ending|final|coda/.test(n)) return 'outro';
  return 'other';
}

const SHORT: Record<SectionKind, string> = {
  verse: 'V', pre: 'PC', chorus: 'C', bridge: 'B', intro: 'In', outro: 'Out', other: '',
};

// "Verse 2" → "V2", "Chorus" → "C", "Pre-chorus" → "PC", "Tag" → "T".
export function sectionShort(name: string): string {
  const kind = sectionKind(name);
  const num = name.match(/\d+/)?.[0] ?? '';
  const base = SHORT[kind] || (name.trim()[0]?.toUpperCase() ?? '?');
  return base + num;
}

// Full class strings (Tailwind only ships classes it can find spelled out in the source).
export const SECTION_STYLES: Record<SectionKind, {
  chip: string;   // badge / map chip at rest
  solid: string;  // badge / map chip while that section plays
  soft: string;   // the playing section's tinted wrapper in the chart
  bar: string;    // its stretch of the playback bar's timeline
  rule: string;   // the playing section's header underline
}> = {
  verse: {
    chip: 'bg-teal-500/10 text-teal-700 border-teal-500/25 dark:text-teal-300',
    solid: 'bg-teal-600 text-white border-teal-600 dark:bg-teal-400 dark:text-teal-950 dark:border-teal-400',
    soft: 'bg-teal-500/[0.06] border-teal-500/25',
    bar: 'bg-teal-500/30',
    rule: 'border-teal-500/70',
  },
  pre: {
    chip: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',
    solid: 'bg-sky-600 text-white border-sky-600 dark:bg-sky-400 dark:text-sky-950 dark:border-sky-400',
    soft: 'bg-sky-500/[0.06] border-sky-500/25',
    bar: 'bg-sky-500/30',
    rule: 'border-sky-500/70',
  },
  chorus: {
    chip: 'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300',
    solid: 'bg-violet-600 text-white border-violet-600 dark:bg-violet-400 dark:text-violet-950 dark:border-violet-400',
    soft: 'bg-violet-500/[0.06] border-violet-500/25',
    bar: 'bg-violet-500/30',
    rule: 'border-violet-500/70',
  },
  bridge: {
    chip: 'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-300',
    solid: 'bg-orange-600 text-white border-orange-600 dark:bg-orange-400 dark:text-orange-950 dark:border-orange-400',
    soft: 'bg-orange-500/[0.06] border-orange-500/25',
    bar: 'bg-orange-500/30',
    rule: 'border-orange-500/70',
  },
  intro: {
    chip: 'bg-slate-500/10 text-slate-700 border-slate-500/25 dark:text-slate-300',
    solid: 'bg-slate-600 text-white border-slate-600 dark:bg-slate-400 dark:text-slate-950 dark:border-slate-400',
    soft: 'bg-slate-500/[0.06] border-slate-500/25',
    bar: 'bg-slate-500/30',
    rule: 'border-slate-500/70',
  },
  outro: {
    chip: 'bg-slate-500/10 text-slate-700 border-slate-500/25 dark:text-slate-300',
    solid: 'bg-slate-600 text-white border-slate-600 dark:bg-slate-400 dark:text-slate-950 dark:border-slate-400',
    soft: 'bg-slate-500/[0.06] border-slate-500/25',
    bar: 'bg-slate-500/30',
    rule: 'border-slate-500/70',
  },
  other: {
    chip: 'bg-slate-500/10 text-slate-700 border-slate-500/25 dark:text-slate-300',
    solid: 'bg-slate-600 text-white border-slate-600 dark:bg-slate-400 dark:text-slate-950 dark:border-slate-400',
    soft: 'bg-slate-500/[0.06] border-slate-500/25',
    bar: 'bg-slate-500/30',
    rule: 'border-slate-500/70',
  },
};

export const sectionStyle = (name: string) => SECTION_STYLES[sectionKind(name)];
