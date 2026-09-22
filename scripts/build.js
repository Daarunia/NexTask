import path from 'node:path'
import pc from 'picocolors'
import fs from 'node:fs'
import { build } from 'vite'
import compile from './private/tsc.js'
import { ROOT } from './private/paths.js'

function buildRenderer() {
  return build({
    configFile: path.join(ROOT, 'vite.config.mjs'),
    base: './',
    mode: 'production',
  })
}

// Suppression du dossier build
fs.rmSync(path.join(ROOT, 'build'), {
  recursive: true,
  force: true,
})

console.log(pc.blue('Transpiling Prisma, renderer & main...'))

/**
 * Build
 */
try {
  // Compiler le main
  const mainPath = path.join(ROOT, 'src', 'main')
  await compile(mainPath)

  // Compiler le preload
  const preloadPath = path.join(ROOT, 'src', 'main', 'preload')
  await compile(preloadPath)

  // Compiler le renderer
  await buildRenderer()

  console.log(pc.green('Prisma, main & renderer successfully transpiled!'))
  console.log(pc.green('Build ready for electron-builder !'))
} catch (err) {
  console.error(pc.red('Erreur lors du build complet : '), err)
  process.exit(1)
}
