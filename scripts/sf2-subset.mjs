// Writes a SoundFont holding only the given General MIDI programs (bank 0) of another one:
// their presets, the instruments those use, and the samples those use — with every index
// renumbered and the sample data packed again. The rest of the file is left out.
//
//   node sf2subset.mjs <in.sf2> <out.sf2> 0,25,33 [releaseSeconds]
//
// Each item of the list is a program of bank 0 (`25`), a program of another bank (`128:0`,
// the General MIDI percussion kit; `8:4`, a variation), or `all` for every melodic preset
// the font has. An item starting with `-` leaves that one out again (`-100`).
//
// With releaseSeconds, no note takes longer than that to die away once it is let go
// (releaseVolEnv, generator 38, capped on every instrument zone; a preset's offset to it is
// never allowed to lengthen it) — except in the presets that hold their note (presetHolds
// below), whose tail is part of the sound: a pad, strings, an organ, the wind. The engine
// keeps such a note ringing across the bar line and lets it go when the chord changes; a
// web note of 3 steps on a Howling Winds that dies in 0.12 s leaves a silence in every bar
// where the app's tail covers the next note.
//
// HOLDS_LIST=<file.json> also writes [bank, program, holds] for every kept preset, for the
// check against the engine's own rule (scripts/check-holds.mjs).
//
// Why: the app's GeneralUser.sf2 is 30.8 MB, and the three programs a song starts with need
// 2.6 MB of it. The web downloads the subset.
import fs from 'node:fs';

const [, , inPath, outPath, list, releaseArg] = process.argv;
const items = list.split(',').map((item) => item.trim()).filter(Boolean);
const key = (bank, program) => bank * 1000 + program;
const parse = (item) => {
  const [a, c] = item.split(':').map(Number);
  return c === undefined ? key(0, a) : key(a, c);
};
const wanted = new Set(items.filter((i) => !i.startsWith('-') && i !== 'all').map(parse));
const unwanted = new Set(items.filter((i) => i.startsWith('-')).map((i) => parse(i.slice(1))));
const everyMelodic = items.includes('all');
// In timecents, as the file keeps it: 1200 * log2(seconds).
const releaseCap = releaseArg ? Math.round(1200 * Math.log2(Number(releaseArg))) : null;
const RELEASE_VOL_ENV = 38;
const b = fs.readFileSync(inPath);

const chunks = {};
const lists = {};
const walk = (off, end) => {
  while (off < end) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'RIFF' || id === 'LIST') {
      lists[b.toString('ascii', off + 8, off + 12)] = { off, size };
      walk(off + 12, off + 8 + size);
    } else chunks[id] = { off: off + 8, size };
    off += 8 + size + (size & 1);
  }
};
walk(0, b.length);

const records = (id, n) => {
  const { off, size } = chunks[id];
  return Array.from({ length: size / n }, (_, i) => b.subarray(off + i * n, off + (i + 1) * n));
};
const phdr = records('phdr', 38);
const pbag = records('pbag', 4);
const pmod = records('pmod', 10);
const pgen = records('pgen', 4);
const inst = records('inst', 22);
const ibag = records('ibag', 4);
const imod = records('imod', 10);
const igen = records('igen', 4);
const shdr = records('shdr', 46);
const u16 = (r, o) => r.readUInt16LE(o);

// ── Which presets hold their note ──
// The engine's rule (channelHolds in native_audio.cpp): some region of the preset loops and
// its volume envelope stays at -20 dB or more (tsf: sustain gain >= 0.1) while the key is down.
// A region is a preset zone x an instrument zone, each with its global zone's generators under
// it; the generators read here are tsf's: loop offsets (2, 3, 45, 50) and the loop points of
// the sample, sustainVolEnv (37, centibels, 0..1440, a preset's offset added) and sampleModes (54).
const genOf = (gens, from, to, id) => {
  for (let g = from; g < to; g++) if (u16(gens[g], 0) === id) return gens[g];
  return null;
};
const zonesOf = (bags, gens, from, to, own) => {
  const zones = [];
  for (let bg = from; bg < to; bg++) {
    const range = [u16(bags[bg], 0), u16(bags[bg + 1], 0)];
    zones.push({ range, link: genOf(gens, ...range, own) });
  }
  const global = zones.length && !zones[0].link ? zones.shift() : null;
  return { global, zones: zones.filter((z) => z.link) };
};
const amount = (gens, zone, id, signed = true) => {
  const gen = zone && genOf(gens, ...zone.range, id);
  return gen ? (signed ? gen.readInt16LE(2) : gen.readUInt16LE(2)) : null;
};
function presetHolds(p) {
  const pz = zonesOf(pbag, pgen, u16(phdr[p], 24), u16(phdr[p + 1], 24), 41);
  for (const pZone of pz.zones) {
    const i = u16(pZone.link, 2);
    const iz = zonesOf(ibag, igen, u16(inst[i], 20), u16(inst[i + 1], 20), 53);
    for (const iZone of iz.zones) {
      const read = (id, signed) => {
        const local = amount(igen, iZone, id, signed);
        return local ?? amount(igen, iz.global, id, signed);
      };
      const mode = (read(54, false) ?? 0) & 3;
      if (mode !== 1 && mode !== 3) continue;
      const sample = shdr[u16(genOf(igen, ...iZone.range, 53), 2)];
      const sum = (fine, coarse) =>
        [iz.global, iZone].reduce((t, z) => t + (amount(igen, z, fine) ?? 0) + (amount(igen, z, coarse) ?? 0) * 32768, 0);
      const first = sample.readUInt32LE(20);
      const start = sample.readUInt32LE(28) - first + sum(2, 45);
      let end = sample.readUInt32LE(32) - first + sum(3, 50);
      if (sample.readUInt32LE(32) - first > 0) end -= 1;
      if (!(start < end)) continue;
      const preset = (id) => amount(pgen, pZone, id) ?? amount(pgen, pz.global, id) ?? 0;
      const cb = Math.min(1440, Math.max(0, (read(37) ?? 0) + preset(37)));
      if (10 ** (-cb / 200) >= 0.1) return true;
    }
  }
  return false;
}

// ── What to keep ──
const presets = [];
for (let p = 0; p < phdr.length - 1; p++) {
  const bank = u16(phdr[p], 22);
  const k = key(bank, u16(phdr[p], 20));
  if (unwanted.has(k)) continue;
  if (wanted.has(k) || (everyMelodic && bank < 128)) presets.push(p);
}
// The kits (banks 120 and up) are never held: the engine plays them as one-shots.
const holding = new Set(presets.filter((p) => u16(phdr[p], 22) < 120 && presetHolds(p)));
if (process.env.HOLDS_LIST) {
  fs.writeFileSync(process.env.HOLDS_LIST, JSON.stringify(presets.map((p) => [u16(phdr[p], 22), u16(phdr[p], 20), holding.has(p) ? 1 : 0])));
}
// An instrument is kept once per way it is wanted: as the font has it (a holding preset keeps
// its tail) or with its tail cut. Several of the font's instruments serve both a pad and a
// plucked sound (the clean guitar is also in "Star Theme"), so a holding preset points at its
// own copy: entry = instrument * 2 + 1 for the long tail, * 2 for the rest.
const entryOf = (p, i) => i * 2 + (releaseCap !== null && holding.has(p) ? 1 : 0);
const instSet = new Set();
for (const p of presets) {
  for (let bg = u16(phdr[p], 24); bg < u16(phdr[p + 1], 24); bg++) {
    for (let g = u16(pbag[bg], 0); g < u16(pbag[bg + 1], 0); g++) if (u16(pgen[g], 0) === 41) instSet.add(entryOf(p, u16(pgen[g], 2)));
  }
}
const instList = [...instSet].sort((a, c) => a - c);
const sampleSet = new Set();
for (const entry of instList) {
  const i = entry >> 1;
  for (let bg = u16(inst[i], 20); bg < u16(inst[i + 1], 20); bg++) {
    for (let g = u16(ibag[bg], 0); g < u16(ibag[bg + 1], 0); g++) if (u16(igen[g], 0) === 53) sampleSet.add(u16(igen[g], 2));
  }
}
// Stereo pairs travel together: a left sample points at its right one.
for (const s of [...sampleSet]) {
  const link = u16(shdr[s], 42);
  const type = u16(shdr[s], 44);
  if ((type & 0x6) && link < shdr.length - 1) sampleSet.add(link);
}
const sampleList = [...sampleSet].sort((a, c) => a - c);
const instIndex = new Map(instList.map((v, i) => [v, i]));
const sampleIndex = new Map(sampleList.map((v, i) => [v, i]));

// ── Sample data: each kept sample, then the 46 zero points the format asks for ──
const smplOff = chunks.smpl.off;
const newStart = new Map();
let cursor = 0;
for (const s of sampleList) {
  newStart.set(s, cursor);
  cursor += shdr[s].readUInt32LE(24) - shdr[s].readUInt32LE(20) + 46;
}
const smpl = Buffer.alloc(cursor * 2);
for (const s of sampleList) {
  const start = shdr[s].readUInt32LE(20);
  const end = shdr[s].readUInt32LE(24);
  b.copy(smpl, newStart.get(s) * 2, smplOff + start * 2, smplOff + end * 2);
}

// ── Hydra, renumbered ──
const out = { phdr: [], pbag: [], pmod: [], pgen: [], inst: [], ibag: [], imod: [], igen: [], shdr: [] };
for (const p of presets) {
  const rec = Buffer.from(phdr[p]);
  rec.writeUInt16LE(out.pbag.length, 24);
  out.phdr.push(rec);
  for (let bg = u16(phdr[p], 24); bg < u16(phdr[p + 1], 24); bg++) {
    const bag = Buffer.alloc(4);
    bag.writeUInt16LE(out.pgen.length, 0);
    bag.writeUInt16LE(out.pmod.length, 2);
    out.pbag.push(bag);
    for (let m = u16(pbag[bg], 2); m < u16(pbag[bg + 1], 2); m++) out.pmod.push(Buffer.from(pmod[m]));
    for (let g = u16(pbag[bg], 0); g < u16(pbag[bg + 1], 0); g++) {
      const gen = Buffer.from(pgen[g]);
      if (u16(gen, 0) === 41) gen.writeUInt16LE(instIndex.get(entryOf(p, u16(gen, 2))), 2);
      if (releaseCap !== null && !holding.has(p) && u16(gen, 0) === RELEASE_VOL_ENV) gen.writeInt16LE(Math.min(gen.readInt16LE(2), 0), 2);
      out.pgen.push(gen);
    }
  }
}
for (const entry of instList) {
  const i = entry >> 1;
  const rec = Buffer.from(inst[i]);
  rec.writeUInt16LE(out.ibag.length, 20);
  out.inst.push(rec);
  for (let bg = u16(inst[i], 20); bg < u16(inst[i + 1], 20); bg++) {
    const bag = Buffer.alloc(4);
    bag.writeUInt16LE(out.igen.length, 0);
    bag.writeUInt16LE(out.imod.length, 2);
    out.ibag.push(bag);
    for (let m = u16(ibag[bg], 2); m < u16(ibag[bg + 1], 2); m++) out.imod.push(Buffer.from(imod[m]));
    for (let g = u16(ibag[bg], 0); g < u16(ibag[bg + 1], 0); g++) {
      const gen = Buffer.from(igen[g]);
      if (u16(gen, 0) === 53) gen.writeUInt16LE(sampleIndex.get(u16(gen, 2)), 2);
      if (releaseCap !== null && !(entry & 1) && u16(gen, 0) === RELEASE_VOL_ENV) gen.writeInt16LE(Math.min(gen.readInt16LE(2), releaseCap), 2);
      out.igen.push(gen);
    }
  }
}
for (const s of sampleList) {
  const rec = Buffer.from(shdr[s]);
  const shift = newStart.get(s) - rec.readUInt32LE(20);
  for (const o of [20, 24, 28, 32]) rec.writeUInt32LE(rec.readUInt32LE(o) + shift, o);
  const type = u16(rec, 44);
  if (type & 0x6) rec.writeUInt16LE(sampleIndex.get(u16(rec, 42)) ?? 0, 42);
  out.shdr.push(rec);
}

// Terminal records: they close the ranges of the one before them.
const eop = Buffer.alloc(38); eop.write('EOP', 0, 'ascii'); eop.writeUInt16LE(out.pbag.length, 24); out.phdr.push(eop);
const pEnd = Buffer.alloc(4); pEnd.writeUInt16LE(out.pgen.length, 0); pEnd.writeUInt16LE(out.pmod.length, 2); out.pbag.push(pEnd);
out.pmod.push(Buffer.alloc(10));
out.pgen.push(Buffer.alloc(4));
const eoi = Buffer.alloc(22); eoi.write('EOI', 0, 'ascii'); eoi.writeUInt16LE(out.ibag.length, 20); out.inst.push(eoi);
const iEnd = Buffer.alloc(4); iEnd.writeUInt16LE(out.igen.length, 0); iEnd.writeUInt16LE(out.imod.length, 2); out.ibag.push(iEnd);
out.imod.push(Buffer.alloc(10));
out.igen.push(Buffer.alloc(4));
const eos = Buffer.alloc(46); eos.write('EOS', 0, 'ascii'); out.shdr.push(eos);

// ── Assemble ──
const chunk = (id, data) => {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
const list_ = (type, body) => {
  const head = Buffer.alloc(12);
  head.write('LIST', 0, 'ascii');
  head.writeUInt32LE(body.length + 4, 4);
  head.write(type, 8, 'ascii');
  return Buffer.concat([head, body]);
};
const info = b.subarray(lists.INFO.off, lists.INFO.off + 8 + lists.INFO.size);
const sdta = list_('sdta', chunk('smpl', smpl));
const pdta = list_('pdta', Buffer.concat(
  ['phdr', 'pbag', 'pmod', 'pgen', 'inst', 'ibag', 'imod', 'igen', 'shdr'].map((id) => chunk(id, Buffer.concat(out[id])))),
);
const body = Buffer.concat([Buffer.from('sfbk', 'ascii'), info, sdta, pdta]);
const riff = Buffer.alloc(8);
riff.write('RIFF', 0, 'ascii');
riff.writeUInt32LE(body.length, 4);
fs.writeFileSync(outPath, Buffer.concat([riff, body]));
console.log(`${outPath}: ${presets.length} presets (${holding.size} hold their note), ${instList.length} instruments, ${sampleList.length} samples, ${((8 + body.length) / 1048576).toFixed(2)} MB`);
