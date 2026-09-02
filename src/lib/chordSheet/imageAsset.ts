// Turns a user-picked logo/watermark <input type="file"> image into a data URI small
// enough to live inline in the chart's `layout` jsonb column (see presets.ts's StyleAssets)
// — downscaled client-side via canvas rather than uploaded to storage, so a shared or
// forked chart's images just come along with `layout` automatically.

/** Reads an image file and re-encodes it, capped to `maxDim` on its longest side. PNGs stay
 *  PNG (so a transparent logo/watermark keeps its transparency); everything else becomes
 *  JPEG at `quality`. Rejects non-image files. */
export async function fileToDataUri(file: File, maxDim: number, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const isPng = file.type === 'image/png';
    return canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
