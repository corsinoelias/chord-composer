// Canvas chord sheet generator — no external dependencies

export interface ImageSection {
  name: string;
  lines: Array<{ chord: string; lyrics: string }[]>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W       = 1080;
const PAD     = 72;       // side padding
const CW      = W - PAD * 2;

// Fonts
const F_TITLE    = 'bold 62px system-ui, Arial, sans-serif';
const F_ARTIST   = '500 38px system-ui, Arial, sans-serif';
const F_BADGE    = '600 26px system-ui, Arial, sans-serif';
const F_SECT     = '700 22px system-ui, Arial, sans-serif';
const F_CHORD    = "bold 30px 'Courier New', monospace";
const F_LYRIC    = '400 32px system-ui, Arial, sans-serif';
const F_FOOTER   = '400 22px system-ui, Arial, sans-serif';

// Heights (pixels)
const CHORD_H    = 34;   // space reserved for the chord row
const LYRIC_H    = 38;   // space reserved for the lyric row
const LINE_H     = CHORD_H + LYRIC_H + 10;  // total per lyric line
const SECT_GAP   = 40;   // gap between sections
const GROUP_PAD  = 8;    // extra width per token group

// Colors
const C_BG       = '#ffffff';
const C_ACCENT   = '#1a56db';
const C_TITLE    = '#0f172a';
const C_ARTIST   = '#475569';
const C_BADGE_BG = '#eff6ff';
const C_BADGE    = '#1a56db';
const C_SECT     = '#94a3b8';
const C_CHORD    = '#1a56db';
const C_LYRIC    = '#1e293b';
const C_LINE     = '#e2e8f0';
const C_FOOTER   = '#94a3b8';

// ── Helpers ───────────────────────────────────────────────────────────────────
function setFont(ctx: CanvasRenderingContext2D, font: string) { ctx.font = font; }
function mw(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}
function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(t, x, y);
  ctx.textAlign = 'left';
}
function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, lw = 1.5) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export function generateSongImage(
  title: string,
  artist: string,
  displayKey: string,
  capo: number | undefined,
  bpm: number,
  sections: ImageSection[],
  slug: string,
  transpose: number,
): HTMLCanvasElement {
  // ─ First pass: measure total height ─
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = 100;
  const tc = tmp.getContext('2d')!;
  const totalH = computeHeight(tc, sections);

  // ─ Second pass: draw on final canvas ─
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, totalH);

  // Top accent bar
  ctx.fillStyle = C_ACCENT;
  ctx.fillRect(0, 0, W, 14);

  let y = 14 + 56;

  // Title
  text(ctx, title.toUpperCase(), PAD, y, F_TITLE, C_TITLE);
  y += 68;

  // Artist
  text(ctx, artist, PAD, y, F_ARTIST, C_ARTIST);
  y += 48;

  // Badges
  const badges: string[] = [
    `Key: ${displayKey}${transpose ? ` (${transpose > 0 ? '+' : ''}${transpose})` : ''}`,
    ...(capo ? [`Capo ${capo}`] : []),
    `${bpm} BPM`,
  ];
  let bx = PAD;
  for (const badge of badges) {
    const bw = mw(ctx, badge, F_BADGE) + 28;
    const bh = 38;
    ctx.fillStyle = C_BADGE_BG;
    roundRect(ctx, bx, y - 24, bw, bh, 8);
    text(ctx, badge, bx + 14, y - 1, F_BADGE, C_BADGE);
    bx += bw + 10;
  }
  y += 28;

  // Divider
  y += 24;
  hline(ctx, PAD, W - PAD, y, C_LINE, 2);
  y += 32;

  // Sections
  for (const section of sections) {
    const hasContent = section.lines.some(l => l.some(t => t.chord || t.lyrics.trim()));
    if (!hasContent) continue;

    // Section name
    text(ctx, section.name.toUpperCase(), PAD, y, F_SECT, C_SECT);
    y += 6;
    hline(ctx, PAD, PAD + 100, y, C_LINE);
    y += 20;

    for (const line of section.lines) {
      if (!line.length) continue;

      const isChordOnly = line.every(t => !t.lyrics.trim());

      if (isChordOnly) {
        // Instrumental line: chords in a row
        let cx = PAD;
        for (const tok of line) {
          if (!tok.chord) continue;
          text(ctx, tok.chord, cx, y + CHORD_H - 4, F_CHORD, C_CHORD);
          cx += mw(ctx, tok.chord, F_CHORD) + 28;
        }
        y += CHORD_H + 14;
        continue;
      }

      // Chord-above-lyric
      let lx = PAD;
      let lineStartY = y;

      for (const tok of line) {
        const chord = tok.chord ?? '';
        const lyric = tok.lyrics ?? '';
        const cw = chord ? mw(ctx, chord, F_CHORD) + GROUP_PAD : 0;
        const lw2 = lyric ? mw(ctx, lyric, F_LYRIC) + GROUP_PAD : 0;
        const gw = Math.max(cw, lw2, 12);

        // Wrap to next line
        if (lx + gw > W - PAD && lx > PAD) {
          lx = PAD;
          lineStartY += LINE_H;
          y = lineStartY;
        }

        if (chord) text(ctx, chord, lx, lineStartY + CHORD_H - 4, F_CHORD, C_CHORD);
        if (lyric) text(ctx, lyric, lx, lineStartY + CHORD_H + LYRIC_H - 4, F_LYRIC, C_LYRIC);

        lx += gw;
      }
      y = lineStartY + LINE_H + 6;
    }

    y += SECT_GAP;
  }

  // Footer
  hline(ctx, PAD, W - PAD, y, C_LINE);
  y += 32;
  text(ctx, `chordsequence.com/songs/${slug}/`, W / 2, y, F_FOOTER, C_FOOTER, 'center');

  return canvas;
}

function computeHeight(ctx: CanvasRenderingContext2D, sections: ImageSection[]): number {
  // Header: accent + title + artist + badges + divider
  let y = 14 + 56 + 68 + 48 + 28 + 24 + 2 + 32;

  for (const section of sections) {
    const hasContent = section.lines.some(l => l.some(t => t.chord || t.lyrics.trim()));
    if (!hasContent) continue;

    y += 26 + 20; // section name + divider

    for (const line of section.lines) {
      if (!line.length) continue;
      const isChordOnly = line.every(t => !t.lyrics.trim());
      if (isChordOnly) { y += CHORD_H + 14; continue; }

      // Estimate wraps
      let lx = PAD;
      let lines = 1;
      for (const tok of line) {
        const gw = Math.max(
          tok.chord ? mw(ctx, tok.chord, F_CHORD) + GROUP_PAD : 0,
          tok.lyrics ? mw(ctx, tok.lyrics, F_LYRIC) + GROUP_PAD : 12,
        );
        if (lx + gw > W - PAD && lx > PAD) { lx = PAD; lines++; }
        lx += gw;
      }
      y += lines * LINE_H + 6;
    }

    y += SECT_GAP;
  }

  y += 2 + 32 + 32 + 48; // footer
  return y;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
