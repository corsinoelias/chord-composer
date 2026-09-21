// Writes a SoundFont holding only the given General MIDI programs (bank 0) of another one:
// their presets, the instruments those use, and the samples those use — with every index
// renumbered and the sample data packed again. The rest of the file is left out.
//
//   node sf2subset.mjs <in.sf2> <out.sf2> 0,25,33 [releaseSeconds]
//
// With releaseSeconds, no note takes longer than that to die away once it is let go
// (releaseVolEnv, generator 38, capped on every instrument zone; a preset's offset to it is
// never allowed to lengthen it).
//
// Why: the app's GeneralUser.sf2 is 30.8 MB, and the three programs a song starts with need
// 2.6 MB of it. The web downloads the subset.
import fs from 'node:fs';

const [, , inPath, outPath, list, releaseArg] = process.argv;
const programs = list.split(',').map(Number);
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

// ── What to keep ──
const presets = [];
for (let p = 0; p < phdr.length - 1; p++) {
  if (u16(phdr[p], 22) === 0 && programs.includes(u16(phdr[p], 20))) presets.push(p);
}
const instSet = new Set();
for (const p of presets) {
  for (let bg = u16(phdr[p], 24); bg < u16(phdr[p + 1], 24); bg++) {
    for (let g = u16(pbag[bg], 0); g < u16(pbag[bg + 1], 0); g++) if (u16(pgen[g], 0) === 41) instSet.add(u16(pgen[g], 2));
  }
}
const instList = [...instSet].sort((a, c) => a - c);
const sampleSet = new Set();
for (const i of instList) {
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
      if (u16(gen, 0) === 41) gen.writeUInt16LE(instIndex.get(u16(gen, 2)), 2);
      if (releaseCap !== null && u16(gen, 0) === RELEASE_VOL_ENV) gen.writeInt16LE(Math.min(gen.readInt16LE(2), 0), 2);
      out.pgen.push(gen);
    }
  }
}
for (const i of instList) {
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
      if (releaseCap !== null && u16(gen, 0) === RELEASE_VOL_ENV) gen.writeInt16LE(Math.min(gen.readInt16LE(2), releaseCap), 2);
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
console.log(`${outPath}: ${presets.length} presets, ${instList.length} instruments, ${sampleList.length} samples, ${((8 + body.length) / 1048576).toFixed(2)} MB`);
