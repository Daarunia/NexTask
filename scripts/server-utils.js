import { execFileSync } from 'node:child_process'
import path from 'node:path'
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
 *
 * @param {import('vite').ServerOptions} [server] Options du serveur, par-dessus celles de vite.config.mjs
 */
export async function startRenderer(server = {}) {
  // Import à la demande : les fixtures des tests importent ce module sans démarrer
  // Vite, chaque worker chargerait sinon Vite et rolldown pour rien
  const { createServer } = await import('vite')
  let viteServer = await createServer({
    configFile: path.join(ROOT, 'vite.config.mjs'),
    mode: 'development',
    server,
  })
  return viteServer.listen()
}
