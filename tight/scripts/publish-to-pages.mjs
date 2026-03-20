import fs from 'node:fs'
import path from 'node:path'

const projectDir = process.cwd()
const distDir = path.join(projectDir, 'dist')

const distIndex = path.join(distDir, 'index.html')
const distAssetsDir = path.join(distDir, 'assets')

const outIndex = path.join(projectDir, 'index.html')
const outAssetsDir = path.join(projectDir, 'assets')

const outFavicon = path.join(projectDir, 'favicon.svg')
const outIcons = path.join(projectDir, 'icons.svg')

const devTemplate = path.join(projectDir, 'index.dev.html')

function exists(filePath) {
  try {
    fs.accessSync(filePath)
    return true
  } catch {
    return false
  }
}

if (!exists(distIndex)) {
  console.error(
    'publish-to-pages: dist/index.html not found. Run `npm run build` first.',
  )
  process.exit(1)
}

// Preserve your dev template so `npm run dev` still works after publishing.
if (!exists(devTemplate) && exists(outIndex)) {
  const current = fs.readFileSync(outIndex, 'utf8')
  const looksLikeDevIndex = current.includes('src="./src/main.tsx"')
  if (looksLikeDevIndex) {
    fs.renameSync(outIndex, devTemplate)
  }
}

// Replace pages entry with the compiled one.
fs.copyFileSync(distIndex, outIndex)

// Replace compiled assets.
if (exists(outAssetsDir)) {
  fs.rmSync(outAssetsDir, { recursive: true, force: true })
}
fs.mkdirSync(outAssetsDir, { recursive: true })
if (exists(distAssetsDir)) {
  fs.cpSync(distAssetsDir, outAssetsDir, { recursive: true })
}

// Copy common static files expected by the built index.html.
const distFavicon = path.join(distDir, 'favicon.svg')
if (exists(distFavicon)) fs.copyFileSync(distFavicon, outFavicon)

const distIcons = path.join(distDir, 'icons.svg')
if (exists(distIcons)) fs.copyFileSync(distIcons, outIcons)

console.log('publish-to-pages: updated `tight/index.html` and `tight/assets/`.')

