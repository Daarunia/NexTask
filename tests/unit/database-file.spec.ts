import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  checkDatabaseContent,
  type DatabaseLock,
  hasSqliteHeader,
  isForeignLock,
  isSamePath,
  lockFilePath,
  parseLock,
} from '../../src/main/database/databaseFile'

/**
 * Tests unitaires des contrôles d'une base à ouvrir et de son verrou (Vitest,
 * cf. vitest.config.ts), sans lancer l'app ni ouvrir de base SQLite.
 */

const NEXTASK_TABLES = ['_prisma_migrations', 'Board', 'Stage', 'Task', 'Tag']
const MIGRATIONS = ['20250101000000_init', '20250601000000_boards']

describe('hasSqliteHeader', () => {
  test("reconnaît l'en-tête d'une base SQLite", () => {
    expect(hasSqliteHeader(Buffer.from('SQLite format 3\0suite du fichier', 'latin1'))).toBe(true)
  })

  test('refuse un autre fichier, ou un fichier trop court', () => {
    expect(hasSqliteHeader(Buffer.from('{"format":"nextask-export"}'))).toBe(false)
    expect(hasSqliteHeader(Buffer.from('SQLite format 3', 'latin1'))).toBe(false)
    expect(hasSqliteHeader(Buffer.alloc(16))).toBe(false)
  })
})

describe('checkDatabaseContent', () => {
  test('accepte une base NexTask à jour', () => {
    expect(checkDatabaseContent(NEXTASK_TABLES, MIGRATIONS, MIGRATIONS)).toBeNull()
  })

  test("accepte une base d'une version plus ancienne, migrée ensuite au démarrage", () => {
    expect(checkDatabaseContent(NEXTASK_TABLES, MIGRATIONS.slice(0, 1), MIGRATIONS)).toBeNull()
  })

  test("refuse une base SQLite qui n'est pas une base NexTask", () => {
    expect(checkDatabaseContent(['users', 'orders'], [], MIGRATIONS)).toBe('notNextask')
    expect(checkDatabaseContent(['_prisma_migrations', 'Task'], MIGRATIONS, MIGRATIONS)).toBe('notNextask')
  })

  test("refuse une base mise à jour par une version plus récente de l'app", () => {
    expect(checkDatabaseContent(NEXTASK_TABLES, [...MIGRATIONS, '20270101000000_futur'], MIGRATIONS)).toBe(
      'newerVersion',
    )
  })
})

describe('isSamePath', () => {
  test('compare les chemins résolus', () => {
    const file = path.resolve('donnees', 'nextask.db')
    expect(isSamePath(file, path.join('donnees', '.', 'nextask.db'))).toBe(true)
    expect(isSamePath(file, path.resolve('autre', 'nextask.db'))).toBe(false)
  })

  test.runIf(process.platform === 'win32')('ignore la casse sous Windows', () => {
    expect(isSamePath('C:\\Donnees\\NexTask.db', 'c:\\donnees\\nextask.db')).toBe(true)
  })
})

describe('verrou de la base', () => {
  const lock: DatabaseLock = {
    hostname: 'PC-BUREAU',
    pid: 4242,
    openedAt: '2026-10-31T09:00:00.000Z',
    appVersion: '1.9.1',
  }
  const owner = (hostname: string, pid: number, alive: number[] = []) => ({
    hostname,
    pid,
    isAlive: (candidate: number) => alive.includes(candidate),
  })

  test('est rangé à côté de la base', () => {
    expect(lockFilePath(path.join('cle', 'nextask.db'))).toBe(path.join('cle', 'nextask.db.lock'))
  })

  test('se relit depuis son fichier', () => {
    expect(parseLock(JSON.stringify(lock))).toEqual(lock)
  })

  test('illisible ou incomplet, il est ignoré', () => {
    expect(parseLock('pas du json')).toBeNull()
    expect(parseLock(JSON.stringify({ hostname: 'PC-BUREAU' }))).toBeNull()
    expect(parseLock(JSON.stringify({ pid: 12 }))).toBeNull()
  })

  test('sans date ni version, il reste valable', () => {
    expect(parseLock(JSON.stringify({ hostname: 'PC-BUREAU', pid: 12 }))).toEqual({
      hostname: 'PC-BUREAU',
      pid: 12,
      openedAt: '',
      appVersion: '',
    })
  })

  test("posé par une autre machine, il bloque l'ouverture", () => {
    expect(isForeignLock(lock, owner('PC-PORTABLE', 4242))).toBe(true)
  })

  test("posé par un autre processus encore en vie sur cette machine, il bloque l'ouverture", () => {
    expect(isForeignLock(lock, owner('PC-BUREAU', 1000, [4242]))).toBe(true)
  })

  test('laissé par un processus disparu de cette machine, il est périmé', () => {
    expect(isForeignLock(lock, owner('PC-BUREAU', 1000))).toBe(false)
  })

  test("posé par l'app en cours, il ne bloque rien", () => {
    expect(isForeignLock(lock, owner('PC-BUREAU', 4242, [4242]))).toBe(false)
  })
})
