import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import pc from 'picocolors'
import { ROOT } from './private/paths.js'

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit

// Serveur du renderer des tests E2E, démarré une seule fois par Playwright et
// partagé par tous les workers (`webServer` de playwright.config.ts), sur le port
// reçu en argument.
//
// Il sert le renderer construit par le global setup (build/renderer), pas le
// serveur Vite de dev : une dizaine de fichiers par chargement au lieu de ~140
// modules. Chaque requête remonte à Playwright en plusieurs événements réseau, et
// avec plusieurs instances en parallèle ce flux retardait de plusieurs secondes
// chaque rechargement de page.
//
// Les fichiers sont lus à chaque requête : le serveur démarre avant le global
// setup, qui reconstruit le dossier.
const RENDERER_DIR = path.join(ROOT, 'build', 'renderer')

// Adresse de disponibilité attendue par Playwright (`webServer.url`), servie même avant le build
const READY_PATH = '/__ready'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}

const port = Number(process.argv[2])

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname === READY_PATH) {
      res.writeHead(200).end()
      return
    }

    // Chemin borné au dossier du renderer
    const file = path.join(
      RENDERER_DIR,
      path.normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)),
    )
    if (!file.startsWith(RENDERER_DIR + path.sep)) {
      res.writeHead(403).end()
      return
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        // Assets nommés d'après leur contenu : gardés en cache, index.html relu à chaque chargement
        'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'max-age=31536000, immutable' : 'no-cache',
      })
      res.end(data)
    })
  })
  .listen(port, () => console.log(pc.green(`Renderer des tests servi sur le port ${port}`)))
