import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'
import { createTaskViaApi } from '../../helpers/tag.helper'
import { restoreDialogs, stubOpenDialog, stubSaveDialog } from '../../helpers/dialog.helper'
import { EXPORT_FORMAT, EXPORT_VERSION } from '../../../src/main/shared/data.constants'

/**
 * Tests E2E de l'export / import des données et de la sauvegarde automatique.
 *
 * Les routes GET /data/export et POST /data/import, qu'utilise le main, sont
 * testées directement, aller-retour compris. Les boutons de la page
 * Paramètres sont testés avec des boîtes de dialogue natives remplacées dans
 * le main (cf. dialog.helper). La sauvegarde, quotidienne en temps normal,
 * est déclenchée à la demande via POST /test/run-backup.
 *
 * Isolation : base, paramètres et sauvegardes remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées, dans l'ordre (cf. prisma/seeds/01_initial_stages.sql)
const SEEDED_STAGES = ['A faire', 'En cours', 'En attente', 'Terminé']

/** Fichier d'export, tel que renvoyé par GET /data/export. */
interface ExportFile {
  format: string
  version: number
  appVersion: string
  exportedAt: string
  stages: { id: number; name: string; position: number }[]
  tags: { id: number; name: string; color: string; createdAt: string }[]
  tasks: {
    id: number
    title: string
    stageId: number | null
    isHistorized: boolean
    historizationDate: string | null
    position: number
    updatedAt: string
    tagIds: number[]
  }[]
}

/** Export courant via GET /data/export. */
async function exportData(request: APIRequestContext): Promise<ExportFile> {
  const res = await request.get(`${API}/data/export`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ExportFile
}

/**
 * Contenu comparable de deux exports : sans la date d'export ni la date de
 * dernière modification des tâches (gérée par Prisma).
 * @param data Export
 */
function comparable(data: ExportFile) {
  return {
    stages: data.stages,
    tags: data.tags,
    tasks: data.tasks.map(({ updatedAt: _updatedAt, ...task }) => task),
  }
}

/**
 * Décor commun : une colonne en plus, une tâche active à deux tags et une
 * tâche archivée à un tag.
 * @param request Contexte de requête Playwright
 */
async function seedData(request: APIRequestContext) {
  expect((await request.post(`${API}/stages`, { data: { name: 'Revue', position: 5 } })).ok()).toBeTruthy()
  await createTaskViaApi(request, 'Active', ['bug', 'ui'])
  const archived = await createTaskViaApi(request, 'Archivée', ['ui'])
  expect((await request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()
}

/**
 * Envoie un fichier à POST /data/import.
 * @param request Contexte de requête Playwright
 * @param data Contenu du fichier
 */
function importData(request: APIRequestContext, data: unknown) {
  return request.post(`${API}/data/import`, { data })
}

test.describe('GET /data/export', () => {
  test('exporte colonnes, tags et tâches (archives comprises) avec format et version', async ({ page }) => {
    await seedData(page.request)

    const data = await exportData(page.request)

    expect(data.format).toBe(EXPORT_FORMAT)
    expect(data.version).toBe(EXPORT_VERSION)
    expect(data.stages.map((s) => s.name)).toEqual([...SEEDED_STAGES, 'Revue'])
    expect(data.tags.map((t) => t.name).sort()).toEqual(['bug', 'ui'])

    const tagId = (name: string) => data.tags.find((t) => t.name === name)!.id
    const active = data.tasks.find((t) => t.title === 'Active')
    const archived = data.tasks.find((t) => t.title === 'Archivée')
    expect(active).toMatchObject({ isHistorized: false, tagIds: [tagId('bug'), tagId('ui')].sort((a, b) => a - b) })
    expect(archived).toMatchObject({ isHistorized: true, stageId: null, tagIds: [tagId('ui')] })
    expect(archived?.historizationDate).toBeTruthy()
  })
})

test.describe('POST /data/import', () => {
  test("l'aller-retour export → import restitue les mêmes données", async ({ page }) => {
    await seedData(page.request)
    const original = await exportData(page.request)

    // Les données changent après l'export…
    const revue = original.stages.find((s) => s.name === 'Revue')!
    expect((await page.request.delete(`${API}/stages/${revue.id}`)).ok()).toBeTruthy()
    await createTaskViaApi(page.request, 'Intruse', ['nouveau'])

    // … puis l'import les remplace toutes
    const res = await importData(page.request, original)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toEqual({ stages: 5, tags: 2, tasks: 2 })

    expect(comparable(await exportData(page.request))).toEqual(comparable(original))

    // Les ids repris n'empêchent pas de créer ensuite de nouvelles données
    const created = await createTaskViaApi(page.request, 'Après import', ['bug'])
    expect(original.tasks.map((t) => t.id)).not.toContain(created.id)
    expect(created.tags.map((t) => t.id)).toEqual([original.tags.find((t) => t.name === 'bug')!.id])
  })

  test('un export vide vide toutes les données', async ({ page }) => {
    await seedData(page.request)
    const empty = { ...(await exportData(page.request)), stages: [], tags: [], tasks: [] }

    const res = await importData(page.request, empty)
    expect(res.ok(), await res.text()).toBeTruthy()

    const after = await exportData(page.request)
    expect([after.stages, after.tags, after.tasks]).toEqual([[], [], []])
  })

  test.describe('fichier invalide : refusé sans rien modifier', () => {
    const cases: { name: string; change: (data: ExportFile) => unknown; message?: RegExp }[] = [
      { name: 'version inconnue', change: (data) => ({ ...data, version: 99 }), message: /Version de format 99/ },
      { name: 'autre format', change: (data) => ({ ...data, format: 'autre' }), message: /pas un export NexTask/ },
      { name: 'sans les tâches', change: ({ tasks: _tasks, ...data }) => data },
      {
        name: 'tâche dans une colonne absente',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, stageId: t.stageId ?? 999999 })) }),
        message: /colonne absente/,
      },
      {
        name: 'tag absent du fichier',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, tagIds: [...t.tagIds, 999999] })) }),
        message: /tag absent/,
      },
      {
        name: 'noms de tags en double (casse mise à part)',
        change: (data) => ({ ...data, tags: data.tags.map((t) => ({ ...t, name: 'Doublon' })) }),
        message: /Plusieurs tags/,
      },
      {
        name: 'id de tâche en double',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, id: data.tasks[0].id })) }),
        message: /plusieurs fois/,
      },
    ]

    for (const { name, change, message } of cases) {
      test(name, async ({ page }) => {
        await seedData(page.request)
        const before = await exportData(page.request)

        const res = await importData(page.request, change(before))
        expect(res.status()).toBe(400)
        if (message) expect(((await res.json()) as { message: string }).message).toMatch(message)

        expect(comparable(await exportData(page.request))).toEqual(comparable(before))
      })
    }

    test("un corps qui n'est pas du JSON", async ({ page }) => {
      await seedData(page.request)
      const before = await exportData(page.request)

      const res = await page.request.post(`${API}/data/import`, {
        headers: { 'Content-Type': 'application/json' },
        data: '{ pas du json',
      })
      expect(res.status()).toBe(400)

      expect(comparable(await exportData(page.request))).toEqual(comparable(before))
    })
  })
})

test.describe('Export et import depuis les Paramètres', () => {
  test.afterEach(async ({ electronApp }) => {
    await restoreDialogs(electronApp)
  })

  test("l'export écrit le fichier choisi", async ({ page, electronApp, header, settingsPage }, testInfo) => {
    await seedData(page.request)
    const file = testInfo.outputPath('export.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    await stubSaveDialog(electronApp, file)

    await header.goSettings()
    await settingsPage.exportButton.click()

    await expect(page.getByText('Données exportées', { exact: true })).toBeVisible()
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as ExportFile
    expect(written.format).toBe(EXPORT_FORMAT)
    expect(comparable(written)).toEqual(comparable(await exportData(page.request)))
  })

  test("l'import remplace les données après confirmation et le tableau les affiche", async ({
    page,
    electronApp,
    header,
    taskBoard,
    settingsPage,
  }, testInfo) => {
    // Fichier exporté depuis un premier état…
    await createTaskViaApi(page.request, 'Importée', ['bug'])
    const file = testInfo.outputPath('import.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(await exportData(page.request)))

    // … puis remplacé par un autre état, affiché sur le tableau
    const [imported] = (await exportData(page.request)).tasks
    expect((await page.request.delete(`${API}/tasks/${imported.id}`)).ok()).toBeTruthy()
    await createTaskViaApi(page.request, 'Locale', ['ui'])
    await page.reload()
    await expect(taskBoard.taskCard('Locale')).toBeVisible()

    await stubOpenDialog(electronApp, file)
    await header.goSettings()

    // Annuler la confirmation ne change rien
    await settingsPage.askImport()
    await settingsPage.confirmRejectButton.click()
    await expect(settingsPage.confirmPopup).toBeHidden()
    await expect(settingsPage.tag('ui')).toBeVisible()

    // Confirmer importe le fichier : les tags et le tableau sont rechargés sans relancer l'app
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()
    await expect(page.getByText('Données importées', { exact: true })).toBeVisible()
    await expect.poll(() => settingsPage.tagNames()).toEqual(['bug'])

    await header.goHome()
    await expect(taskBoard.taskCard('Importée')).toBeVisible()
    await expect(taskBoard.taskCard('Locale')).toHaveCount(0)
    await expect(taskBoard.taskCardTags('Importée')).toHaveText(['bug'])
  })

  test('un fichier invalide est refusé et ne change rien', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    await createTaskViaApi(page.request, 'Conservée', ['ui'])
    const before = await exportData(page.request)

    const file = testInfo.outputPath('invalid.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...before, version: 99 }))
    await stubOpenDialog(electronApp, file)

    await header.goSettings()
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import refusé', { exact: true })).toBeVisible()
    expect(comparable(await exportData(page.request))).toEqual(comparable(before))
  })
})

test.describe('Sauvegarde automatique', () => {
  /**
   * Passage de la sauvegarde à la date donnée.
   * @param request Contexte de requête Playwright
   * @param now Date de référence
   */
  async function runBackup(request: APIRequestContext, now: Date) {
    const res = await request.post(`${API}/test/run-backup`, { data: { now: now.toISOString() } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()) as { enabled: boolean; created: string | null; backups: string[]; directory: string }
  }

  /**
   * Nom de la sauvegarde d'un jour (date locale, comme le main).
   * @param day Jour de janvier 2026
   */
  const backupName = (day: number) => `nextask-2026-01-${String(day).padStart(2, '0')}.db`

  /** Midi, heure locale, d'un jour de janvier 2026. */
  const januaryNoon = (day: number) => new Date(2026, 0, day, 12)

  test('désactivée par défaut : aucune sauvegarde', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.autoBackupSwitch).not.toBeChecked()

    const result = await runBackup(page.request, januaryNoon(1))
    expect(result).toMatchObject({ enabled: false, created: null, backups: [] })
  })

  test('activée : une copie de la base par jour', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    const first = await runBackup(page.request, januaryNoon(1))
    expect(first).toMatchObject({ enabled: true, created: backupName(1), backups: [backupName(1)] })

    // Une vraie base SQLite, dans le dossier des sauvegardes
    const header16 = fs
      .readFileSync(path.join(first.directory, backupName(1)))
      .subarray(0, 16)
      .toString('latin1')
    expect(header16).toBe('SQLite format 3\0')

    // Un second passage le même jour ne refait pas de copie
    const again = await runBackup(page.request, new Date(2026, 0, 1, 18))
    expect(again).toMatchObject({ created: null, backups: [backupName(1)] })
  })

  test('seules les 7 dernières sauvegardes sont gardées', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    let result = await runBackup(page.request, januaryNoon(1))
    for (let day = 2; day <= 9; day++) {
      result = await runBackup(page.request, januaryNoon(day))
      expect(result.created).toBe(backupName(day))
    }

    expect(result.backups).toEqual([9, 8, 7, 6, 5, 4, 3].map(backupName))
    expect(fs.existsSync(path.join(result.directory, backupName(2)))).toBe(false)
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    await page.reload()

    await expect(settingsPage.autoBackupSwitch).toBeChecked()
  })
})
