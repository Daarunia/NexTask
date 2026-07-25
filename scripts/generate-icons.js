/**
 * Génération des icônes NexTask à partir du tracé maître.
 *
 * La marque « case ouverte » est décrite une seule fois ici (grille 48×48) puis
 * déclinée en deux familles :
 *   - `resources/`        : ce que consomme electron-builder (ico, png, svg maître) ;
 *   - `src/main/static/`  : ce que le main process lit à l'exécution (notifications, Swagger).
 *
 * La rastérisation passe par Electron lui-même (fenêtre transparente hors écran
 * + capturePage) : aucune dépendance native supplémentaire à installer. Le
 * script se relance donc tout seul sous Electron quand on l'appelle avec Node.
 *
 * Usage : npm run icons
 *
 * jcp --ignore-checks le fichier doit être ignoré par le pre-commit
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const RESOURCES_DIR = path.join(ROOT, 'resources')
const STATIC_DIR = path.join(ROOT, 'src', 'main', 'static')

// --- Tracé maître (grille 48×48) ---------------------------------------------
// Identique à celui inliné dans src/renderer/components/AppLogo.vue.
// Le cadre est volontairement ouvert en haut à droite : la coche en sort.
const BOX_PATH = 'M27 7H15a8 8 0 0 0-8 8v18a8 8 0 0 0 8 8h18a8 8 0 0 0 8-8v-8'
const CHECK_PATH = 'm15 25 8 8 20-24'

// Violet 500 → 700 (couleur d'accent par défaut de l'app).
const GRADIENT_FROM = '#8b5cf6'
const GRADIENT_TO = '#6d28d9'

// Tailles produites. Un trait plus épais compense la perte de matière en petit.
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const RENDER_SIZE = 512

/**
 * Épaisseur de trait adaptée à la taille de rendu finale.
 *
 * @param {number} size Taille cible en pixels
 * @returns {number} Épaisseur dans la grille 48×48
 */
function strokeFor(size) {
  if (size <= 24) return 6.4
  if (size <= 32) return 5.6
  return 4.6
}

/**
 * Icône applicative complète : squircle violet + marque blanche.
 *
 * @param {number} stroke Épaisseur du trait
 * @returns {string} Document SVG
 */
function appIconSvg(stroke) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="NexTask">
  <defs>
    <linearGradient id="nt-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRADIENT_FROM}" />
      <stop offset="1" stop-color="${GRADIENT_TO}" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" ry="115" fill="url(#nt-bg)" />
  <g id="nt-mark" transform="translate(80 87) scale(7.042)" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${BOX_PATH}" />
    <path d="${CHECK_PATH}" />
  </g>
</svg>
`
}

/**
 * Marque seule, monochrome et teintable via `currentColor`.
 *
 * @param {number} stroke Épaisseur du trait
 * @returns {string} Document SVG
 */
function markSvg(stroke) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="NexTask">
  <path d="${BOX_PATH}" />
  <path d="${CHECK_PATH}" />
</svg>
`
}

/**
 * @param {number} ms Durée d'attente
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ouvre la fenêtre de rendu hors écran et expose une capture paramétrée par
 * l'épaisseur de trait.
 *
 * Une seule fenêtre est créée pour toute la session : détruire puis recréer une
 * fenêtre hors écran fait tomber le process Chromium (ERR_FAILED au chargement
 * suivant). On modifie donc le DOM en place entre deux captures.
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow Constructeur de fenêtre
 * @param {string} tempDir Répertoire temporaire pour la page de rendu
 * @returns {Promise<{capture: (stroke: number) => Promise<Electron.NativeImage>, close: () => void}>}
 */
async function openRenderer(BrowserWindow, tempDir) {
  // Chromium refuse de naviguer vers une URL `data:` : on passe par un fichier.
  // La marque démarre à une épaisseur nulle pour qu'une première capture ne
  // puisse jamais être confondue avec une variante demandée.
  const page = path.join(tempDir, 'nextask-icon-render.html')
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent}
      svg{display:block;width:${RENDER_SIZE}px;height:${RENDER_SIZE}px}
    </style></head><body>${appIconSvg(0)}</body></html>`,
  )

  const win = new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Rendu hors écran : la capture ne dépend pas d'une fenêtre composée à
    // l'écran, donc le script tourne aussi bien en session détachée.
    webPreferences: { offscreen: true },
  })

  let frames = 0
  /** @type {Electron.NativeImage | null} */
  let lastFrame = null
  win.webContents.on('paint', (_details, _dirty, image) => {
    frames += 1
    lastFrame = image
  })

  await win.loadFile(page)

  return {
    async capture(stroke) {
      const seen = frames
      await win.webContents.executeJavaScript(
        `document.getElementById('nt-mark').setAttribute('stroke-width', '${stroke}')`,
      )

      // Attend le repaint provoqué par la mutation, puis laisse la frame se stabiliser.
      const deadline = Date.now() + 10_000
      while (frames === seen && Date.now() < deadline) await delay(50)
      await delay(150)

      if (!lastFrame || lastFrame.isEmpty()) {
        throw new Error(`Aucune frame reçue pour un trait de ${stroke}`)
      }
      return lastFrame
    },
    close() {
      win.destroy()
      fs.rmSync(page, { force: true })
    },
  }
}

/**
 * Assemble un .ico multi-résolution (entrées PNG, supportées depuis Vista).
 *
 * @param {{size: number, png: Buffer}[]} entries Images sources
 * @returns {Buffer} Contenu du fichier .ico
 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // réservé
  header.writeUInt16LE(1, 2) // type : icône
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((entry, index) => {
    const at = index * 16
    // 0 signifie 256 dans le format ICO.
    const dimension = entry.size >= 256 ? 0 : entry.size
    directory.writeUInt8(dimension, at) // largeur
    directory.writeUInt8(dimension, at + 1) // hauteur
    directory.writeUInt8(0, at + 2) // palette
    directory.writeUInt8(0, at + 3) // réservé
    directory.writeUInt16LE(1, at + 4) // plans
    directory.writeUInt16LE(32, at + 6) // bits par pixel
    directory.writeUInt32LE(entry.png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

/**
 * Écrit un fichier et le journalise relativement à la racine du projet.
 *
 * @param {string} filePath Chemin absolu
 * @param {string | Buffer} content Contenu
 */
function write(filePath, content) {
  fs.writeFileSync(filePath, content)
  console.log('  ✓ ' + path.relative(ROOT, filePath).replace(/\\/g, '/'))
}

/**
 * Produit tous les fichiers. Ne s'exécute que dans le process principal Electron.
 */
async function generate() {
  const { app, BrowserWindow } = await import('electron')

  // Rendu logique 1:1 quel que soit le facteur d'échelle de l'écran, en
  // software pour ne pas dépendre du GPU de la machine de build.
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  app.disableHardwareAcceleration()
  await app.whenReady()

  try {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true })
    fs.mkdirSync(STATIC_DIR, { recursive: true })

    // Sources vectorielles
    write(path.join(RESOURCES_DIR, 'icon.svg'), appIconSvg(strokeFor(512)))
    write(path.join(RESOURCES_DIR, 'icon-mark.svg'), markSvg(strokeFor(512)))
    write(path.join(STATIC_DIR, 'icon.svg'), appIconSvg(strokeFor(512)))

    // Un rendu par épaisseur de trait, réduit ensuite à chaque taille cible.
    const renderer = await openRenderer(BrowserWindow, app.getPath('temp'))
    const masters = new Map()
    try {
      for (const stroke of new Set(SIZES.map(strokeFor))) {
        masters.set(stroke, await renderer.capture(stroke))
      }
    } finally {
      renderer.close()
    }

    /** @type {Map<number, Buffer>} */
    const pngs = new Map()
    for (const size of SIZES) {
      const master = masters.get(strokeFor(size))
      const image = size === RENDER_SIZE ? master : master.resize({ width: size, height: size, quality: 'best' })
      pngs.set(size, image.toPNG())
    }

    // Rasters pour electron-builder
    write(path.join(RESOURCES_DIR, 'icon.png'), pngs.get(512))
    for (const size of SIZES.filter((s) => s !== 512)) {
      write(path.join(RESOURCES_DIR, `icon-${size}.png`), pngs.get(size))
    }
    write(path.join(RESOURCES_DIR, 'icon.ico'), buildIco(ICO_SIZES.map((size) => ({ size, png: pngs.get(size) }))))

    // Rasters embarqués dans l'app (fenêtre et barre des tâches, notifications
    // OS, favicon Swagger)
    write(path.join(STATIC_DIR, 'icon.ico'), buildIco(ICO_SIZES.map((size) => ({ size, png: pngs.get(size) }))))
    write(path.join(STATIC_DIR, 'icon-256.png'), pngs.get(256))
    write(path.join(STATIC_DIR, 'favicon-32.png'), pngs.get(32))
    write(path.join(STATIC_DIR, 'favicon-16.png'), pngs.get(16))

    console.log('Icônes générées.')
    app.exit(0)
  } catch (error) {
    console.error('Échec de la génération des icônes :', error)
    app.exit(1)
  }
}

/**
 * Relance le script sous Electron. `ELECTRON_RUN_AS_NODE` est retiré de
 * l'environnement : positionnée (par VS Code notamment), elle ferait démarrer
 * le binaire en simple Node, sans API graphique.
 */
function relaunchUnderElectron(electronPath) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(electronPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit', env })
  child.on('exit', (code) => process.exit(code ?? 1))
}

// Pas de `await` au niveau racine : Electron n'émet `ready` qu'une fois le
// module d'entrée entièrement évalué, une attente ici bloquerait le process.
if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
  generate().catch((error) => {
    console.error('Échec de la génération des icônes :', error)
    process.exit(1)
  })
} else {
  import('electron').then(({ default: electronPath }) => relaunchUnderElectron(electronPath))
}
