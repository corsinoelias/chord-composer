/** Maps a chord quality onto the colour family it is drawn in (`cp-min`, `cp-sev`, …). */
export function qualityClass(quality: string): string {
  const q = quality.toLowerCase();
  if (q.includes('dim')) return 'cp-dim';
  if (q.includes('aug')) return 'cp-aug';
  if (q.includes('sus')) return 'cp-sus';
  if (q.includes('7') || q.includes('9') || q.includes('11') || q.includes('13')) return 'cp-sev';
  if (q.includes('min') || q === 'm') return 'cp-min';
  return '';
}
