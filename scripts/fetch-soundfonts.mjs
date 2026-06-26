import https from 'https'
import fs from 'fs'
import path from 'path'

const SOUNDFONTS = [
  {
    url: 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_guitar_steel-mp3.js',
    dest: 'public/soundfonts/acoustic_guitar_steel-mp3.js',
  },
]

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

for (const { url, dest } of SOUNDFONTS) {
  const destPath = path.join(root, dest)
  if (fs.existsSync(destPath)) {
    console.log(`[soundfonts] already exists: ${dest}`)
    continue
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, res => {
      if (res.statusCode !== 200) {
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
    }).on('error', reject)
  })
}
