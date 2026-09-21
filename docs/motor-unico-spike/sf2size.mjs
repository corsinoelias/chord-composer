import fs from 'node:fs';
const b = fs.readFileSync('C:/Users/Eliascorsino/Projects/chord_sequencer/assets/sf2/GeneralUser.sf2');
const chunks = {};
const walk = (off, end) => {
  while (off < end) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'LIST' || id === 'RIFF') walk(off + 12, off + 8 + size);
    else chunks[id] = { off: off + 8, size };
    off += 8 + size + (size & 1);
  }
};
walk(0, b.length);
const rec = (id, n) => Array.from({ length: chunks[id].size / n }, (_, i) => chunks[id].off + i * n);
const phdr = rec('phdr', 38).map(o => ({ preset: b.readUInt16LE(o + 20), bank: b.readUInt16LE(o + 22), bag: b.readUInt16LE(o + 24) }));
const pbag = rec('pbag', 4).map(o => b.readUInt16LE(o));
const pgen = rec('pgen', 4).map(o => ({ op: b.readUInt16LE(o), amt: b.readUInt16LE(o + 2) }));
const inst = rec('inst', 22).map(o => b.readUInt16LE(o + 20));
const ibag = rec('ibag', 4).map(o => b.readUInt16LE(o));
const igen = rec('igen', 4).map(o => ({ op: b.readUInt16LE(o), amt: b.readUInt16LE(o + 2) }));
const shdr = rec('shdr', 46).map(o => ({ start: b.readUInt32LE(o + 20), end: b.readUInt32LE(o + 24) }));
const samplesOf = (programs) => {
  const set = new Set();
  for (let p = 0; p < phdr.length - 1; p++) {
    if (phdr[p].bank !== 0 || !programs.includes(phdr[p].preset)) continue;
    for (let bg = phdr[p].bag; bg < phdr[p + 1].bag; bg++)
      for (let g = pbag[bg]; g < pbag[bg + 1]; g++) if (pgen[g].op === 41) {
        const i = pgen[g].amt;
        for (let ib = inst[i]; ib < inst[i + 1]; ib++)
          for (let ig = ibag[ib]; ig < ibag[ib + 1]; ig++) if (igen[ig].op === 53) set.add(igen[ig].amt);
      }
  }
  let bytes = 0; for (const s of set) bytes += (shdr[s].end - shdr[s].start + 46) * 2;
  return { samples: set.size, MB: +(bytes / 1048576).toFixed(1) };
};
console.log('whole file MB', +(b.length / 1048576).toFixed(1));
console.log('default 3 (piano 0, steel 25, finger bass 33):', samplesOf([0, 25, 33]));
console.log('every program the app offers:', samplesOf([0,1,3,4,5,24,25,26,27,28,29,30,31,32,33,34,35,36]));
