import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createServer } from 'vite'
import compile from './private/tsc.js'
import { ROOT } from './private/paths.js'

/**
 * Compilation du main
 */
export async function compileMain() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js')], {
    stdio: 'inherit',
  })
  await compile(path.join(ROOT, 'src', 'main'))
}

/**
 * Arguments d'exécution d'Electron
 */
export function electronArgs(rendererPort, extraArgs = []) {
  return [path.join(ROOT, 'build', 'main', 'main.js'), String(rendererPort), ...extraArgs]
}

/**
 * Démarrage du front
 */
export async function startRenderer() {
  let viteServer = await createServer({
    configFile: path.join(ROOT, 'vite.config.mjs'),
    mode: 'development',
  })
  return viteServer.listen()
}
