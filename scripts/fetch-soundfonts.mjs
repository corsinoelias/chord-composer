import https from 'https'
import fs from 'fs'
import path from 'path'

const INSTRUMENTS = [
  'acoustic_guitar_steel',
  'acoustic_guitar_nylon',
  'electric_guitar_clean',
  'electric_guitar_jazz',
  'electric_guitar_muted',
  'distortion_guitar',
  'overdriven_guitar',
  'guitar_harmonics',
]

const SOUNDFONTS = INSTRUMENTS.map(name => ({
  url: `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/${name}-mp3.js`,
  dest: `public/soundfonts/${name}-mp3.js`,
}))

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

for (const { url, dest } of SOUNDFONTS) {
  const destPath = path.join(root, dest)
  if (fs.existsSync(destPath)) {
    console.log(`[soundfonts] already exists: ${dest}`)
    continue
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  try {
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath)
      https.get(url, res => {
        if (res.statusCode !== 200) {
          file.close()
          fs.rmSync(destPath, { force: true })
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          const kb = (fs.statSync(destPath).size / 1024).toFixed(0)
          console.log(`[soundfonts] downloaded ${dest} (${kb}KB)`)
          resolve()
        })
      }).on('error', err => {
        file.close()
        fs.rmSync(destPath, { force: true })
        reject(err)
      })
    })
  } catch (err) {
    console.warn(`[soundfonts] skipped ${dest}: ${err.message}`)
  }
}
