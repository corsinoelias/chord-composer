// Renders a song to WAV with the app's engine, off the page's main thread.
//
// It calls the engine's own exportWav — the same function the app uses, through the same
// signal path as playback — so the file is what you heard. exportWav writes with fopen and
// fseek; the WASI layer below keeps that file in memory and hands its bytes back.
import { createEngine } from './engine-core.js';

const ERRNO = { SUCCESS: 0, BADF: 8, NOSYS: 52 };
const PREOPEN_FD = 3;   // "/", the one directory the engine may open files in
const FILE_FD = 4;

/** Just enough of a WASI file system for one file written, rewound and closed. */
function memoryFileSystem() {
  let data = new Uint8Array(1 << 20);
  let size = 0;
  let position = 0;
  const grow = (need) => {
    if (need <= data.length) return;
    let next = data.length;
    while (next < need) next *= 2;
    const bigger = new Uint8Array(next);
    bigger.set(data.subarray(0, size));
    data = bigger;
  };
  const dv = (memory) => new DataView(memory.buffer);
  return {
    file: () => data.slice(0, size),
    wasi: {
      clock_time_get: (memory, _id, _precision, out) => {
        dv(memory).setBigUint64(out, BigInt(Math.round(performance.now() * 1e6)), true);
        return ERRNO.SUCCESS;
      },
      fd_prestat_get: (memory, fd, out) => {
        if (fd !== PREOPEN_FD) return ERRNO.BADF;
        dv(memory).setUint8(out, 0);            // a directory
        dv(memory).setUint32(out + 4, 1, true); // its name, "/", is one byte
        return ERRNO.SUCCESS;
      },
      fd_prestat_dir_name: (memory, fd, path, length) => {
        if (fd !== PREOPEN_FD) return ERRNO.BADF;
        if (length > 0) new Uint8Array(memory.buffer)[path] = 0x2f;
        return ERRNO.SUCCESS;
      },
      path_open: (memory, _dirFd, _dirFlags, _path, _pathLength, _oflags, _rightsBase, _rightsInheriting, _fdFlags, fdOut) => {
        size = 0;
        position = 0;
        dv(memory).setUint32(fdOut, FILE_FD, true);
        return ERRNO.SUCCESS;
      },
      fd_fdstat_get: (memory, fd, out) => {
        const view = dv(memory);
        view.setUint8(out, fd === FILE_FD ? 4 : 2); // regular file, or a character device
        view.setUint16(out + 2, 0, true);
        view.setBigUint64(out + 8, 0xffffffffffffffffn, true);
        view.setBigUint64(out + 16, 0xffffffffffffffffn, true);
        return ERRNO.SUCCESS;
      },
      fd_fdstat_set_flags: () => ERRNO.SUCCESS,
      fd_write: (memory, fd, iovs, iovsLength, written) => {
        const view = dv(memory);
        const heap = new Uint8Array(memory.buffer);
        let total = 0;
        for (let i = 0; i < iovsLength; i++) {
          const ptr = view.getUint32(iovs + i * 8, true);
          const len = view.getUint32(iovs + i * 8 + 4, true);
          if (fd === FILE_FD) {
            grow(position + len);
            data.set(heap.subarray(ptr, ptr + len), position);
            position += len;
            if (position > size) size = position;
          }
          total += len;
        }
        view.setUint32(written, total, true);
        return ERRNO.SUCCESS;
      },
      fd_seek: (memory, fd, offset, whence, out) => {
        if (fd !== FILE_FD) return ERRNO.BADF;
        const base = whence === 0 ? 0 : whence === 1 ? position : size;
        position = base + Number(offset);
        dv(memory).setBigUint64(out, BigInt(position), true);
        return ERRNO.SUCCESS;
      },
      fd_read: (memory, _fd, _iovs, _iovsLength, read) => {
        dv(memory).setUint32(read, 0, true);
        return ERRNO.SUCCESS;
      },
      fd_close: () => ERRNO.SUCCESS,
    },
  };
}

self.onmessage = async ({ data: { id, wasm, sf2, kit, commands, steps, tailSeconds } }) => {
  try {
    const fs = memoryFileSystem();
    const engine = await createEngine(wasm, fs.wasi);
    const e = engine.exports;
    e.wg_set_rate(48000);
    engine.loadSoundFont(sf2);
    engine.loadKit(kit);
    engine.apply(commands);
    const began = performance.now();
    const frames = e.wg_export_wav(engine.cstr(0, '/song.wav'), steps, tailSeconds);
    const ms = performance.now() - began;
    if (frames <= 0) throw new Error('the engine rendered nothing');
    const wav = fs.file();
    self.postMessage({ id, wav, frames, ms }, [wav.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String((error && error.message) || error) });
  }
};
