import { readFile, stat } from 'node:fs/promises'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { restoreDialogs, stubSaveDialog } from '../../helpers/dialog.helper'
import {
  addDocument,
  createTask,
  type DocumentTask,
  documentStoreState,
  setDocumentLimits,
} from '../../helpers/document.helper'
import { TaskDocuments } from '../../components/TaskDocuments'
import type { AppSettings } from '@core/shared/settings.constants'

/**
 * Tests E2E de l'interface des documents joints aux tâches : section Documents
 * du dialogue (ajout par le bouton ou par dépôt, suppression, ouverture,
 * enregistrement), trombone des cartes, consultation aux Archives et réglages
 * des Paramètres. Les routes elles-mêmes sont couvertes par document-api.spec.ts.
 *
 * Isolation, la base, les paramètres et le dossier des documents sont remis à
 * zéro avant chaque test (fixture `cleanState`).
 */

const TITLE = 'Avec documents'

/** Tâche de l'API, relue pour contrôler ses documents. */
async function readTask(request: Parameters<typeof createTask>[0], id: number): Promise<DocumentTask> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as DocumentTask
}

test.describe('section Documents du dialogue de tâche', () => {
  test('joint des fichiers choisis, les liste avec leur taille, et la carte affiche leur nombre', async ({
    page,
    taskBoard,
    taskDocuments,
  }) => {
    const task = await createTask(page.request, TITLE)
    await page.reload()
    await expect(taskBoard.cardDocumentsBadge(TITLE)).toHaveCount(0)

    await taskBoard.openEditDialog(TITLE)
    await expect(taskDocuments.hint).toHaveText('Ajoute des fichiers ou glisse-les sur la tâche.')

    await taskDocuments.add(
      { name: 'devis.pdf', content: 'x'.repeat(2048), mimeType: 'application/pdf' },
      { name: 'notes.txt', content: 'Bonjour' },
    )

    await expect.poll(() => taskDocuments.nameList()).toEqual(['devis.pdf', 'notes.txt'])
    await expect(taskDocuments.uploads).toHaveCount(0)
    await expect(taskDocuments.item('devis.pdf').getByTestId('task-document-size')).toHaveText(/^2\sko$/)
    await expect(taskDocuments.count).toHaveText('2/10')
    await expect(taskDocuments.hint).toHaveCount(0)
    expect((await readTask(page.request, task.id)).documents.map((doc) => doc.name)).toEqual(['devis.pdf', 'notes.txt'])

    // Rien à enregistrer : les documents sont déjà envoyés, le dialogue se ferme sans confirmation
    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    const badge = taskBoard.cardDocumentsBadge(TITLE)
    await expect(badge).toHaveText('2')
    await expect(badge).toHaveAttribute('aria-label', '2 documents : devis.pdf, notes.txt')
  })

  test('joint les fichiers déposés sur le dialogue, et rend unique un nom déjà pris', async ({
    page,
    taskBoard,
    taskDocuments,
  }) => {
    const task = await createTask(page.request, TITLE)
    await addDocument(page.request, task.id, 'devis.pdf', 'première version')
    await page.reload()
    await taskBoard.openEditDialog(TITLE)

    await taskDocuments.dragOver()
    await expect(taskDocuments.dropOverlay).toHaveText('Dépose les fichiers pour les joindre à la tâche')

    await taskDocuments.drop({ name: 'devis.pdf', content: 'seconde version' }, { name: 'photo.png', content: 'png' })
    await expect(taskDocuments.dropOverlay).toBeHidden()
    await expect.poll(() => taskDocuments.nameList()).toEqual(['devis.pdf', 'devis (2).pdf', 'photo.png'])
  })

  test('refuse avant l’envoi un fichier trop volumineux, puis tout ajout à une tâche pleine', async ({
    page,
    taskBoard,
    taskDocuments,
  }) => {
    await createTask(page.request, TITLE)
    await setDocumentLimits(page, { documentMaxSizeMb: 1, documentMaxPerTask: 2 })
    await page.reload()
    await taskBoard.openEditDialog(TITLE)

    await taskDocuments.add({ name: 'gros.bin', content: Buffer.alloc(1024 * 1024 + 1) })
    await expect(taskDocuments.errorToast).toContainText('gros.bin non ajouté')
    await expect(taskDocuments.errorToast).toContainText('Le fichier dépasse la taille maximale (1 Mo).')
    await expect(taskDocuments.items).toHaveCount(0)
    expect((await documentStoreState(page.request)).files).toBe(0)

    await taskDocuments.add({ name: 'a.txt', content: 'a' }, { name: 'b.txt', content: 'b' })
    await expect.poll(() => taskDocuments.nameList()).toEqual(['a.txt', 'b.txt'])
    await expect(taskDocuments.count).toHaveText('2/2')
    await expect(taskDocuments.addButton).toBeDisabled()
  })

  test('supprime un document après confirmation, son fichier avec lui', async ({ page, taskBoard, taskDocuments }) => {
    const task = await createTask(page.request, TITLE)
    await addDocument(page.request, task.id, 'devis.pdf', 'contenu')
    await page.reload()
    await expect(taskBoard.cardDocumentsBadge(TITLE)).toHaveText('1')
    await taskBoard.openEditDialog(TITLE)

    // Refus : le document reste
    await taskDocuments.deleteButton('devis.pdf').click()
    await expect(taskBoard.confirmPopup).toContainText('Supprimer « devis.pdf » de la tâche ?')
    await taskBoard.confirmRejectButton.click()
    await expect(taskDocuments.items).toHaveCount(1)

    await taskDocuments.delete('devis.pdf')
    await expect(taskDocuments.items).toHaveCount(0)
    await expect(taskDocuments.hint).toBeVisible()
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })

    await taskBoard.cancelButton.click()
    await expect(taskBoard.cardDocumentsBadge(TITLE)).toHaveCount(0)
  })

  test('ouvre une copie du document, sous son nom', async ({ page, taskBoard, taskDocuments }) => {
    const task = await createTask(page.request, TITLE)
    await addDocument(page.request, task.id, 'compte rendu.txt', 'Réunion du lundi')
    await page.reload()
    await taskBoard.openEditDialog(TITLE)

    await taskDocuments.open('compte rendu.txt')

    const opened = async () => (await (await page.request.get(`${API}/test/opened-documents`)).json()) as unknown[]
    await expect.poll(opened).toHaveLength(1)
    const [copy] = (await opened()) as { name: string; path: string }[]
    expect(copy.name).toBe('compte rendu.txt')
    expect(copy.path).toMatch(/compte rendu\.txt$/)
    expect(await readFile(copy.path, 'utf8')).toBe('Réunion du lundi')
    // Copie en lecture seule : une modification n'irait pas dans le document joint
    expect((await stat(copy.path)).mode & 0o200).toBe(0)
  })

  test('un exécutable ne s’ouvre jamais, il s’enregistre seulement', async ({
    page,
    electronApp,
    taskBoard,
    taskDocuments,
  }, testInfo) => {
    const task = await createTask(page.request, TITLE)
    await addDocument(page.request, task.id, 'setup.exe', 'MZ binaire')
    await page.reload()
    await taskBoard.openEditDialog(TITLE)

    const name = taskDocuments.item('setup.exe').getByTestId('task-document-name')
    await expect(name).toHaveAttribute('title', 'Programme ou script : enregistre-le pour l’utiliser.')
    expect(await name.evaluate((element) => element.tagName)).toBe('SPAN')

    const target = testInfo.outputPath('setup-copie.exe')
    await stubSaveDialog(electronApp, target)
    try {
      await taskDocuments.saveButton('setup.exe').click()
      await expect(page.locator('.p-toast-message-success')).toContainText('Document enregistré')
      expect(await readFile(target, 'utf8')).toBe('MZ binaire')
    } finally {
      await restoreDialogs(electronApp)
    }
    expect(await (await page.request.get(`${API}/test/opened-documents`)).json()).toEqual([])
  })

  test('à la création, invite à enregistrer la tâche avant d’y joindre des documents', async ({
    taskBoard,
    taskDocuments,
  }) => {
    await taskBoard.openCreateDialog('A faire')

    await expect(taskDocuments.hint).toHaveText('Enregistre la tâche pour y joindre des documents.')
    await expect(taskDocuments.addButton).toHaveCount(0)
  })
})

test('aux Archives, les documents se consultent et s’enregistrent, sans ajout ni suppression', async ({
  page,
  electronApp,
  header,
  archivesPage,
}, testInfo) => {
  const task = await createTask(page.request, TITLE)
  await addDocument(page.request, task.id, 'facture.pdf', 'PDF')
  expect((await page.request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()

  await header.goArchives()
  await expect(archivesPage.documentsBadge(TITLE)).toHaveText('1')
  await archivesPage.expandDetails(TITLE)

  const documents = new TaskDocuments(page, archivesPage.item(TITLE))
  await expect.poll(() => documents.nameList()).toEqual(['facture.pdf'])
  await expect(documents.addButton).toHaveCount(0)
  await expect(documents.deleteButton('facture.pdf')).toHaveCount(0)
  await expect(documents.hint).toHaveCount(0)

  const target = testInfo.outputPath('facture.pdf')
  await stubSaveDialog(electronApp, target)
  try {
    await documents.saveButton('facture.pdf').click()
    await expect(page.locator('.p-toast-message-success')).toContainText('Document enregistré')
    expect(await readFile(target, 'utf8')).toBe('PDF')
  } finally {
    await restoreDialogs(electronApp)
  }
})

test('les Paramètres règlent les limites des documents et affichent leur place', async ({
  page,
  header,
  settingsPage,
}) => {
  const task = await createTask(page.request, TITLE)
  await addDocument(page.request, task.id, 'a.txt', 'x'.repeat(1536))
  await addDocument(page.request, task.id, 'b.txt', 'x'.repeat(1536))

  await header.goSettings()
  // Même contenu joint deux fois : compté une seule fois
  await expect(settingsPage.documentUsage).toHaveText(/^2 documents, 1,5\sko$/)
  await expect(settingsPage.documentMaxSizeInput).toHaveValue('100 Mo')
  await expect(settingsPage.documentMaxPerTaskInput).toHaveValue('10')

  await settingsPage.documentMaxPerTaskInput.fill('25')
  await settingsPage.documentMaxPerTaskInput.blur()
  // Hors bornes : ramené au plafond à la sortie du champ
  await settingsPage.documentMaxSizeInput.fill('5000')
  await settingsPage.documentMaxSizeInput.blur()

  const stored = () =>
    page.evaluate(async () => {
      const bridge = globalThis as unknown as { settings: { getAll: () => Promise<AppSettings> } }
      const all = await bridge.settings.getAll()
      return [all.documentMaxSizeMb, all.documentMaxPerTask]
    })
  await expect.poll(stored).toEqual([1024, 25])
})
