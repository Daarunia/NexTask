import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { restoreDialogs, stubOpenDialog, stubSaveDialog } from '../../helpers/dialog.helper'
import { readExportArchive, writeExportArchive } from '../../helpers/archive.helper'
import {
  addDocument,
  createTask,
  documentContent,
  type DocumentTask,
  documentStoreState,
  sha256Of,
} from '../../helpers/document.helper'
import { EXPORT_ARCHIVE_DATA } from '@core/shared/data.constants'

/**
 * Tests E2E des documents dans l'export et l'import : description des
 * documents dans GET /data/export, recréation par POST /data/import selon les
 * contenus présents, et archive .zip écrite et relue depuis les Paramètres.
 *
 * Isolation, la base, les paramètres et le dossier des documents sont remis à
 * zéro avant chaque test (fixture `cleanState`).
 */

/** Document tel que décrit dans un export. */
interface ExportedDocument {
  name: string
  size: number
  sha256: string
  createdAt: string
}

/** Export, réduit aux tâches et à leurs documents. */
interface DocumentExport {
  tasks: { id: number; title: string; documents: ExportedDocument[] }[]
  [key: string]: unknown
}

/** Export courant via GET /data/export. */
async function exportData(request: Parameters<typeof createTask>[0]): Promise<DocumentExport> {
  const res = await request.get(`${API}/data/export`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as DocumentExport
}

/** Tâches de l'API, avec leurs documents (archivées comprises). */
async function allTasks(request: Parameters<typeof createTask>[0]): Promise<DocumentTask[]> {
  const res = await request.get(`${API}/tasks`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as DocumentTask[]
}

test.describe('documents dans GET /data/export et POST /data/import', () => {
  test.use({ ui: false })

  test('l’export décrit chaque document par son nom, sa taille et son empreinte', async ({ page }) => {
    const task = await createTask(page.request, 'Avec documents')
    await addDocument(page.request, task.id, 'devis.pdf', 'PDF')
    await addDocument(page.request, task.id, 'notes.txt', 'Bonjour')

    const data = await exportData(page.request)
    const [exported] = data.tasks
    expect(exported.documents.map(({ createdAt: _createdAt, ...doc }) => doc)).toEqual([
      { name: 'devis.pdf', size: 3, sha256: sha256Of('PDF') },
      { name: 'notes.txt', size: 7, sha256: sha256Of('Bonjour') },
    ])
  })

  test('l’import recrée les documents dont le contenu est présent, et signale les autres', async ({ page }) => {
    const task = await createTask(page.request, 'Avec documents')
    await addDocument(page.request, task.id, 'devis.pdf', 'PDF')
    const data = await exportData(page.request)
    const missing = { name: 'absent.txt', size: 4, sha256: sha256Of('rien'), createdAt: new Date().toISOString() }
    data.tasks[0].documents.push(missing)

    const res = await page.request.post(`${API}/data/import`, { data })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({
      tasks: 1,
      documents: 1,
      warnings: [{ code: 'documentFileMissing', params: { id: task.id, name: 'absent.txt' } }],
    })

    const [imported] = await allTasks(page.request)
    expect(imported.documents.map((doc) => doc.name)).toEqual(['devis.pdf'])
    expect((await documentContent(page.request, imported.documents[0].id)).toString()).toBe('PDF')
  })

  test('l’import recrée un document dont le contenu a été déposé avant lui', async ({ page }) => {
    const task = await createTask(page.request, 'Avec documents')
    await addDocument(page.request, task.id, 'devis.pdf', 'PDF')
    const data = await exportData(page.request)

    // Tâche supprimée : son contenu quitte le dossier
    expect((await page.request.delete(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    expect((await documentStoreState(page.request)).files).toBe(0)

    const sha256 = sha256Of('PDF')
    const put = await page.request.put(`${API}/documents/files/${sha256}`, {
      headers: { 'Content-Type': 'application/octet-stream' },
      data: Buffer.from('PDF'),
    })
    expect(put.ok(), await put.text()).toBeTruthy()

    const res = await page.request.post(`${API}/data/import`, { data })
    expect(await res.json()).toMatchObject({ documents: 1, warnings: [] })
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })
})

test.describe('POST /data/import/check', () => {
  test.use({ ui: false })

  test('contrôle un export comme l’import, sans rien modifier', async ({ page }) => {
    const task = await createTask(page.request, 'Conservée')
    const data = await exportData(page.request)

    const valid = await page.request.post(`${API}/data/import/check`, { data: { ...data, tasks: [] } })
    expect(valid.ok(), await valid.text()).toBeTruthy()

    const refused = await page.request.post(`${API}/data/import/check`, { data: { ...data, version: 99 } })
    expect(refused.status()).toBe(400)
    expect(await refused.json()).toMatchObject({ problem: { code: 'unsupportedVersion' } })

    expect((await allTasks(page.request)).map((existing) => existing.id)).toEqual([task.id])
  })
})

test.describe('archive d’export depuis les Paramètres', () => {
  test.afterEach(async ({ electronApp }) => {
    await restoreDialogs(electronApp)
  })

  test('l’aller-retour par une archive restitue les documents et leur contenu, archives comprises', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const active = await createTask(page.request, 'Active')
    await addDocument(page.request, active.id, 'devis.pdf', 'PDF')
    await addDocument(page.request, active.id, 'photo.png', 'PNG')
    const archived = await createTask(page.request, 'Archivée')
    // Même contenu que « devis.pdf » : une seule entrée dans l'archive
    await addDocument(page.request, archived.id, 'copie.pdf', 'PDF')
    expect((await page.request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()

    const file = testInfo.outputPath('export.zip')
    await stubSaveDialog(electronApp, file)
    await header.goSettings()
    await settingsPage.exportButton.click()
    await expect(page.getByText(/^4 colonnes, 2 tâches, 0 tag, 0 modèle de checklist, 3 documents dans /)).toBeVisible()

    const archive = await readExportArchive(file)
    expect(archive.entries[0]).toBe(EXPORT_ARCHIVE_DATA)
    expect([...archive.documents.keys()].sort((a, b) => a.localeCompare(b))).toEqual(
      [sha256Of('PDF'), sha256Of('PNG')].sort((a, b) => a.localeCompare(b)),
    )
    expect(archive.documents.get(sha256Of('PNG'))?.toString()).toBe('PNG')

    // Tout supprimé : plus aucun contenu dans le dossier
    for (const task of [active, archived]) {
      expect((await page.request.delete(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    }
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })

    await stubOpenDialog(electronApp, file)
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()
    await expect(page.getByText('Données importées', { exact: true })).toBeVisible()
    await expect(
      page.getByText('4 colonnes, 2 tâches, 0 tag, 0 modèle de checklist, 3 documents', { exact: true }),
    ).toBeVisible()

    const tasks = await allTasks(page.request)
    const byTitle = (title: string) => tasks.find((task) => task.title === title)!
    expect(byTitle('Active').documents.map((doc) => doc.name)).toEqual(['devis.pdf', 'photo.png'])
    expect(byTitle('Archivée').documents.map((doc) => doc.name)).toEqual(['copie.pdf'])
    expect((await documentContent(page.request, byTitle('Archivée').documents[0].id)).toString()).toBe('PDF')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 3, files: 2, uploads: 0 })
  })

  test('l’export prévient quand des fichiers de documents manquent au dossier', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const task = await createTask(page.request, 'Incomplète')
    await addDocument(page.request, task.id, 'present.txt', 'là')
    await addDocument(page.request, task.id, 'perdu.txt', 'parti')
    // Fichier retiré du dossier hors de l'app (synchronisation, suppression à la main)
    const { directory } = await documentStoreState(page.request)
    const lost = sha256Of('parti')
    fs.rmSync(path.join(directory, lost.slice(0, 2), lost))

    const file = testInfo.outputPath('incomplet.zip')
    await stubSaveDialog(electronApp, file)
    await header.goSettings()
    await settingsPage.exportButton.click()

    const warning = page.locator('.p-toast-message-warn')
    await expect(warning).toContainText('Export incomplet')
    await expect(warning).toContainText("1 document dont le fichier manque n'a pas pu être joint à l'archive.")
    expect([...(await readExportArchive(file)).documents.keys()]).toEqual([sha256Of('là')])
  })

  test('une archive au document endommagé est refusée, sans rien changer ni rien laisser', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const kept = await createTask(page.request, 'Conservée')
    await addDocument(page.request, kept.id, 'garde.txt', 'garde')
    const data = await exportData(page.request)

    // Données d'une autre tâche, dont le contenu ne correspond pas à son empreinte
    const sha256 = sha256Of('attendu')
    const other = { ...data.tasks[0], id: kept.id + 1, title: 'Importée' }
    other.documents = [{ name: 'faux.txt', size: 7, sha256, createdAt: new Date().toISOString() }]
    const file = testInfo.outputPath('endommagée.zip')
    await writeExportArchive(file, { ...data, tasks: [other] }, { [sha256]: 'modifié' })

    await stubOpenDialog(electronApp, file)
    await header.goSettings()
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import refusé', { exact: true })).toBeVisible()
    await expect(page.getByText("Un document de l'archive est endommagé ou trop volumineux")).toBeVisible()
    expect((await allTasks(page.request)).map((task) => task.title)).toEqual(['Conservée'])
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1, uploads: 0 })
  })

  test('une archive refusée au contrôle des données ne dépose aucun contenu', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const sha256 = sha256Of('contenu')
    const file = testInfo.outputPath('version-inconnue.zip')
    await writeExportArchive(
      file,
      {
        format: 'nextask-export',
        version: 99,
        stages: [],
        tags: [],
        tasks: [{ documents: [{ name: 'x.txt', size: 7, sha256 }] }],
      },
      { [sha256]: 'contenu' },
    )

    await stubOpenDialog(electronApp, file)
    await header.goSettings()
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import refusé', { exact: true })).toBeVisible()
    await expect.poll(async () => (await documentStoreState(page.request)).files).toBe(0)
  })

  test('une archive sans données est refusée', async ({ page, electronApp, header, settingsPage }, testInfo) => {
    const file = testInfo.outputPath('vide.zip')
    await writeExportArchive(file, undefined, { [sha256Of('x')]: 'x' })

    await stubOpenDialog(electronApp, file)
    await header.goSettings()
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import refusé', { exact: true })).toBeVisible()
    await expect(page.getByText("Le fichier n'est pas une archive d'export NexTask lisible")).toBeVisible()
  })
})
