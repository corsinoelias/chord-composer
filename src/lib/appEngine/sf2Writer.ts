/**
 * A minimal SoundFont 2 writer: recordings in, a .sf2 the engine's tsf can load out.
 *
 * Made for the sound audition (/lab/sounds/), to hear the web's own recordings through the
 * app's engine beside the app's SoundFont; and the way back, if they are kept, for shipping
 * them to both (option B of docs/motor-unico-wasm.md, docs/sonidos-comunes.md).
 *
 * One preset per instrument, bank 0; each recording a zone covering the keys nearest its own
 * pitch, played unlooped (a recording's own decay is its sustain), mono, 16-bit.
 */

export interface Sf2Sample {
  /** The note the recording actually sounds, as MIDI. */
  midi: number;
  pcm: Float32Array;
  rate: number;
}

export interface Sf2Preset {
  name: string;
  program: number;
  samples: Sf2Sample[];
  /** Seconds a note takes to die away once let go (releaseVolEnv). */
  releaseSeconds?: number;
}

const enc = new TextEncoder();
const GEN = { releaseVolEnv: 38, instrument: 41, keyRange: 43, sampleModes: 54, sampleID: 53, overridingRootKey: 58 };

class Bytes {
  parts: Uint8Array[] = [];
  length = 0;
  push(u: Uint8Array) { this.parts.push(u); this.length += u.length; }
  u8(...v: number[]) { this.push(Uint8Array.from(v)); }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.push(b); }
  i16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v, true); this.push(b); }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); this.push(b); }
  str(s: string, size: number) { const b = new Uint8Array(size); b.set(enc.encode(s).slice(0, size - 1)); this.push(b); }
  bytes(): Uint8Array { const out = new Uint8Array(this.length); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

function chunk(id: string, body: Uint8Array): Uint8Array {
  const out = new Bytes();
  out.push(enc.encode(id));
  out.u32(body.length);
  out.push(body);
  if (body.length & 1) out.u8(0);
  return out.bytes();
}

function list(type: string, ...chunks: Uint8Array[]): Uint8Array {
  const body = new Bytes();
  body.push(enc.encode(type));
  for (const c of chunks) body.push(c);
  return chunk('LIST', body.bytes());
}

export function writeSf2(presets: Sf2Preset[], name = 'Audition'): ArrayBuffer {
  const smpl = new Bytes();
  const shdr = new Bytes();
  const inst = new Bytes(), ibag = new Bytes(), igen = new Bytes(), imod = new Bytes();
  const phdr = new Bytes(), pbag = new Bytes(), pgen = new Bytes(), pmod = new Bytes();
  let sampleIndex = 0, sampleFrames = 0, igenCount = 0, ibagCount = 0, pgenCount = 0, pbagCount = 0;

  presets.forEach((preset, p) => {
    const samples = [...preset.samples].sort((a, b) => a.midi - b.midi);
    // Instrument: one zone per recording, over the keys nearest it.
    inst.str(preset.name, 20); inst.u16(ibagCount);
    samples.forEach((s, i) => {
      const lo = i === 0 ? 0 : Math.floor((samples[i - 1].midi + s.midi) / 2) + 1;
      const hi = i === samples.length - 1 ? 127 : Math.floor((s.midi + samples[i + 1].midi) / 2);
      ibag.u16(igenCount); ibag.u16(0); ibagCount++;
      igen.u16(GEN.keyRange); igen.u8(lo, hi); igenCount++;
      if (preset.releaseSeconds) { igen.u16(GEN.releaseVolEnv); igen.i16(Math.round(1200 * Math.log2(preset.releaseSeconds))); igenCount++; }
      igen.u16(GEN.sampleModes); igen.u16(0); igenCount++;
      igen.u16(GEN.sampleID); igen.u16(sampleIndex); igenCount++;
      // The sample data, 16-bit, followed by the 46 zero frames the format asks for.
      const start = sampleFrames;
      const pcm = new Int16Array(s.pcm.length + 46);
      for (let k = 0; k < s.pcm.length; k++) pcm[k] = Math.max(-32768, Math.min(32767, Math.round(s.pcm[k] * 32767)));
      smpl.push(new Uint8Array(pcm.buffer));
      sampleFrames += pcm.length;
      shdr.str(`${preset.name.slice(0, 12)} ${s.midi}`, 20);
      shdr.u32(start); shdr.u32(start + s.pcm.length); shdr.u32(start); shdr.u32(start + s.pcm.length);
      shdr.u32(Math.round(s.rate)); shdr.u8(s.midi, 0); shdr.u16(0); shdr.u16(1);
      sampleIndex++;
    });
    // Preset: one zone, the instrument above.
    phdr.str(preset.name, 20); phdr.u16(preset.program); phdr.u16(0); phdr.u16(pbagCount);
    phdr.u32(0); phdr.u32(0); phdr.u32(0);
    pbag.u16(pgenCount); pbag.u16(0); pbagCount++;
    pgen.u16(GEN.instrument); pgen.u16(p); pgenCount++;
  });
  // Terminal records.
  phdr.str('EOP', 20); phdr.u16(0); phdr.u16(0); phdr.u16(pbagCount); phdr.u32(0); phdr.u32(0); phdr.u32(0);
  pbag.u16(pgenCount); pbag.u16(0);
  pmod.push(new Uint8Array(10));
  pgen.u32(0);
  inst.str('EOI', 20); inst.u16(ibagCount);
  ibag.u16(igenCount); ibag.u16(0);
  imod.push(new Uint8Array(10));
  igen.u32(0);
  shdr.str('EOS', 20); shdr.push(new Uint8Array(26));

  const ifil = new Bytes(); ifil.u16(2); ifil.u16(1);
  const info = list('INFO',
    chunk('ifil', ifil.bytes()),
    chunk('isng', enc.encode('EMU8000\0')),
    chunk('INAM', enc.encode(`${name}\0`)),
  );
  const sdta = list('sdta', chunk('smpl', smpl.bytes()));
  const pdta = list('pdta',
    chunk('phdr', phdr.bytes()), chunk('pbag', pbag.bytes()), chunk('pmod', pmod.bytes()), chunk('pgen', pgen.bytes()),
    chunk('inst', inst.bytes()), chunk('ibag', ibag.bytes()), chunk('imod', imod.bytes()), chunk('igen', igen.bytes()),
    chunk('shdr', shdr.bytes()),
  );
  const body = new Bytes();
  body.push(enc.encode('sfbk')); body.push(info); body.push(sdta); body.push(pdta);
  return chunk('RIFF', body.bytes()).slice().buffer;
}
