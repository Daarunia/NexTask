import { execSync } from 'node:child_process'
import path from 'node:path'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import compile from './private/tsc.js'

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Compilation du main
 */
export async function compileMain() {
  execSync('node', [path.join(__dirname, '..', 'build.js')], {
    stdio: 'inherit',
  })
  await compile(path.join(__dirname, '..', 'src', 'main'))
}

/**
 * Arguments d'exécution d'Electron
 */
export function electronArgs(rendererPort, extraArgs = []) {
  return [path.join(__dirname, '..', 'build', 'main', 'main.js'), String(rendererPort), ...extraArgs]
}

/**
 * Démarrage du front
 */
export async function startRenderer() {
  let viteServer = await createServer({
    configFile: path.join(__dirname, '..', 'vite.config.mjs'),
    mode: 'development',
  })
  return viteServer.listen()
}
