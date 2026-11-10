import { spawn } from 'node:child_process'
import path from 'node:path'
import { ROOT } from './private/paths.js'

/**
 * Tests E2E en mode remote : NexTask Client, chaque worker sur son conteneur
 * du serveur (image de test, cf. tests/helpers/remote.helper.ts). Docker requis.
 *
 *   npm run test:e2e:remote [-- arguments de playwright test]
 */

const playwright = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
const child = spawn(process.execPath, [playwright, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NEXTASK_E2E_MODE: 'remote' },
})
child.on('exit', (code) => process.exit(code ?? 1))
