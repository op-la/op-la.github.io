import fs from 'node:fs'
import path from 'node:path'

const projectDir = process.cwd()
const indexDev = path.join(projectDir, 'index.dev.html')
const indexHtml = path.join(projectDir, 'index.html')

// When we “publish”, we replace `index.html` with the compiled entry (hashed assets).
// This preparation step ensures `vite build` always uses the source entry that points
// to `./src/main.tsx`.
if (fs.existsSync(indexDev)) {
  fs.copyFileSync(indexDev, indexHtml)
  console.log('prepare-vite-build: restored `index.html` from `index.dev.html`')
}

