/**
 * The files that make up the web's copy of the app's audio engine, and how they are hashed.
 * Shared by engine-sync.mjs (which writes engine/source.json) and check-engine.mjs (which
 * holds the repo to it).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TEXT = /\.(cpp|h|json|js|mjs)$/;

/** Every file whose change needs a new `npm run engine:sync`, relative to the repo root. */
export const ENGINE_FILES = (drums) => [
  'engine/vendor/native_audio.cpp',
  'engine/vendor/tsf.h',
  'engine/web_glue.cpp',
  'engine/shim/aaudio/AAudio.h',
  'public/engine/engine.wasm',
  'public/engine/core.sf2',
  ...drums.map((d) => `public/engine/drums/${d}.pcm`),
];

/**
 * sha256 of a file. Text is hashed with CRLF read as LF: git on Windows checks these out
 * with CRLF and Netlify with LF, and they are the same file.
 */
export function hashFile(file) {
  let bytes = fs.readFileSync(file);
  if (TEXT.test(file)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export const sourceManifestPath = (root) => path.join(root, 'engine/source.json');
