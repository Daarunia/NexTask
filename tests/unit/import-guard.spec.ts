import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { forbiddenMainImports, LOCAL_ONLY_MAIN_MODULES } from '../../scripts/private/import-guard.js'

/**
 * Garde-fou des imports du main (pre-commit) : NexTask Client ne doit charger
 * de core que ses catalogues partagés.
 */

describe('forbiddenMainImports', () => {
  test('accepte les catalogues partagés de core et les imports de types', () => {
    const content = [
      "import { API_VERSION } from '../../core/shared/api.constants.js'",
      "import { t as tCore } from '../../core/i18n.js'",
      "import { fr } from '../../core/locales/index.js'",
      "import { setLogger } from '../../core/logger.js'",
      "import type { DueReminder } from '../../core/scheduler/reminders.js'",
      "import Logger from 'electron-log'",
    ].join('\n')
    expect(forbiddenMainImports('src/main/system/dataTransfer.ts', content)).toEqual([])
  })

  test('refuse le reste de core, même sur plusieurs lignes ou par import dynamique', () => {
    const content = [
      'import {',
      '  startServer,',
      "} from '../core/server/index.js'",
      "const db = await import('../core/database/setupDatabase.js')",
    ].join('\n')
    expect(forbiddenMainImports('src/main/main.ts', content)).toEqual([
      '../core/server/index.js',
      '../core/database/setupDatabase.js',
    ])
  })

  test('les modules du backend local importent tout core', () => {
    const content = "import { startServer } from '../../core/server/index.js'"
    for (const file of LOCAL_ONLY_MAIN_MODULES) expect(forbiddenMainImports(file, content)).toEqual([])
  })

  test('seul main.ts charge le backend local, et par import dynamique', () => {
    expect(forbiddenMainImports('src/main/main.ts', "await import('./backend/local.js')")).toEqual([])
    expect(forbiddenMainImports('src/main/main.ts', "import local from './backend/local.js'")).toEqual([
      './backend/local.js',
    ])
    expect(
      forbiddenMainImports('src/main/system/folders.ts', "import { DB_PATH } from '../database/location.js'"),
    ).toEqual(['../database/location.js'])
  })

  test('le main du dépôt est en règle', () => {
    const files = fs
      .readdirSync('src/main', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => path.join(entry.parentPath, entry.name).replaceAll('\\', '/'))
    expect(files.length).toBeGreaterThan(10)
    const violations = files.flatMap((file) =>
      forbiddenMainImports(file, fs.readFileSync(file, 'utf8')).map((specifier) => `${file} → ${specifier}`),
    )
    expect(violations).toEqual([])
  })
})
