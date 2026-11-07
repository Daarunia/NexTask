import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  addDocument,
  createTask,
  documentContent,
  documentStoreState,
  type DocumentTask,
  postDocument,
  setDocumentLimits,
  sha256Of,
} from '../../helpers/document.helper'
import {
  AFTER_ARCHIVE,
  archiveTask,
  createRecurringTask,
  DAILY,
  localDate,
  restoreTask,
  runRecurrences,
  seriesTasks,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de l'API des documents joints aux tâches : ajout en flux, limites,
 * lecture, suppression sur le disque par tous les chemins, et dépôt par empreinte.
 *
 * Tests API purs. Ils vérifient le dossier autant que la base : un chemin de
 * suppression qui oublierait le fichier ne se verrait nulle part ailleurs.
 *
 * Isolation : la base, les paramètres et le dossier sont remis à zéro avant
 * chaque test (fixture automatique `cleanState`).
 */

test.use({ ui: false })

const MB = 1024 * 1024

test.describe('Ajout', () => {
  test('le contenu relu est identique et la tâche à jour le décrit', async ({ page }) => {
    const task = await createTask(page.request)
    // Tous les octets, pour détecter une lecture en texte
    const content = Buffer.from(Array.from({ length: 256 }, (_, byte) => byte))

    const saved = await addDocument(page.request, task.id, 'devis.pdf', content)

    expect(saved.documents).toHaveLength(1)
    expect(saved.documents[0]).toMatchObject({ name: 'devis.pdf', size: 256 })
    expect(saved.documents[0]).not.toHaveProperty('sha256')
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(task.updatedAt).getTime())
    expect(await documentContent(page.request, saved.documents[0].id)).toEqual(content)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1, uploads: 0 })
  })

  test('toutes les routes de tâches renvoient les documents', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')

    const one = (await (await page.request.get(`${API}/tasks/${task.id}`)).json()) as DocumentTask
    expect(one.documents.map((document) => document.name)).toEqual(['a.txt'])

    const all = (await (await page.request.get(`${API}/tasks`)).json()) as DocumentTask[]
    expect(all.find((candidate) => candidate.id === task.id)?.documents).toHaveLength(1)

    const patched = await page.request.patch(`${API}/tasks/${task.id}`, { data: { title: 'Renommée' } })
    expect(((await patched.json()) as DocumentTask).documents).toHaveLength(1)
  })

  test('un fichier vide est accepté', async ({ page }) => {
    const task = await createTask(page.request)

    const saved = await addDocument(page.request, task.id, 'vide.txt', '')

    expect(saved.documents[0].size).toBe(0)
    expect(await documentContent(page.request, saved.documents[0].id)).toHaveLength(0)
  })

  test('un nom déjà pris devient unique, casse ignorée', async ({ page }) => {
    const task = await createTask(page.request)

    await addDocument(page.request, task.id, 'rapport.pdf', 'un')
    await addDocument(page.request, task.id, 'RAPPORT.pdf', 'deux')
    const saved = await addDocument(page.request, task.id, 'rapport.pdf', 'trois')

    expect(saved.documents.map((document) => document.name)).toEqual([
      'rapport.pdf',
      'RAPPORT (2).pdf',
      'rapport (3).pdf',
    ])
  })

  test('un nom hostile ne désigne jamais un chemin', async ({ page }) => {
    const task = await createTask(page.request)

    const saved = await addDocument(page.request, task.id, String.raw`..\..\evil.pdf:x.exe`, 'contenu')

    expect(saved.documents[0].name).toBe('.._.._evil.pdf_x.exe')
    expect(await documentStoreState(page.request)).toMatchObject({ files: 1 })
  })

  test('un nom vide une fois nettoyé est refusé', async ({ page }) => {
    const task = await createTask(page.request)

    const res = await postDocument(page.request, task.id, ' .. ', 'contenu')

    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('invalidName')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0, uploads: 0 })
  })

  test('deux documents au même contenu partagent un fichier', async ({ page }) => {
    const task = await createTask(page.request)

    await addDocument(page.request, task.id, 'a.txt', 'même contenu')
    await addDocument(page.request, task.id, 'b.txt', 'même contenu')

    expect(await documentStoreState(page.request)).toMatchObject({ documents: 2, files: 1, uploads: 0 })
  })

  test('une tâche inconnue ou archivée ne reçoit pas de document', async ({ page }) => {
    expect((await postDocument(page.request, 999_999, 'a.txt', 'a')).status()).toBe(404)

    const task = await createTask(page.request)
    await page.request.put(`${API}/tasks/${task.id}`)
    const res = await postDocument(page.request, task.id, 'a.txt', 'a')

    expect(res.status()).toBe(409)
    expect((await res.json()).code).toBe('archived')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0, uploads: 0 })
  })

  test('un corps qui n’est pas binaire est refusé, y compris sans requête préalable CORS', async ({ page }) => {
    const task = await createTask(page.request)
    const url = `${API}/tasks/${task.id}/documents?name=a.txt`

    const asText = await page.request.post(url, { headers: { 'Content-Type': 'text/plain' }, data: 'contenu' })
    expect(asText.status()).toBe(415)

    const asJson = await page.request.post(url, { data: { contenu: true } })
    expect(asJson.status()).toBe(415)

    const asForm = await page.request.post(url, { multipart: { file: 'contenu' } })
    expect(asForm.status()).toBe(415)

    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0, uploads: 0 })
  })

  test('un envoi coupé par le client ne laisse rien', async ({ page }) => {
    const task = await createTask(page.request)
    const controller = new AbortController()
    const body = new ReadableStream({
      start(stream) {
        stream.enqueue(Buffer.alloc(64 * 1024, 1))
      },
    })

    const upload = fetch(`${API}/tasks/${task.id}/documents?name=coupe.bin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
      duplex: 'half',
      signal: controller.signal,
    } as RequestInit)
    await expect.poll(async () => (await documentStoreState(page.request)).uploads).toBe(1)

    controller.abort()
    await expect(upload).rejects.toThrow()

    await expect.poll(async () => (await documentStoreState(page.request)).uploads).toBe(0)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })
  })
})

test.describe('Limites', () => {
  test('10 documents par tâche par défaut, réglable', async ({ page }) => {
    const task = await createTask(page.request)
    for (let index = 0; index < 10; index++) await addDocument(page.request, task.id, `${index}.txt`, `${index}`)

    const refused = await postDocument(page.request, task.id, 'onzieme.txt', 'onzième')
    expect(refused.status()).toBe(409)
    expect((await refused.json()).code).toBe('taskFull')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 10, files: 10, uploads: 0 })

    await setDocumentLimits(page, { documentMaxPerTask: 11 })
    await addDocument(page.request, task.id, 'onzieme.txt', 'onzième')
  })

  test('une limite abaissée garde les documents existants et refuse les nouveaux', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')
    await addDocument(page.request, task.id, 'b.txt', 'b')

    await setDocumentLimits(page, { documentMaxPerTask: 1 })

    expect((await postDocument(page.request, task.id, 'c.txt', 'c')).status()).toBe(409)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 2 })
  })

  test('la taille réglée est acceptée, un octet de plus est refusé', async ({ page }) => {
    await setDocumentLimits(page, { documentMaxSizeMb: 1 })
    const task = await createTask(page.request)

    const saved = await addDocument(page.request, task.id, 'juste.bin', Buffer.alloc(MB, 7))
    expect(saved.documents[0].size).toBe(MB)

    const refused = await postDocument(page.request, task.id, 'trop.bin', Buffer.alloc(MB + 1, 8))
    expect(refused.status()).toBe(413)
    expect((await refused.json()).code).toBe('fileTooLarge')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1, uploads: 0 })
  })

  test('un envoi par morceaux qui dépasse la limite est refusé sans rien laisser', async ({ page }) => {
    await setDocumentLimits(page, { documentMaxSizeMb: 1 })
    const task = await createTask(page.request)
    const chunk = Buffer.alloc(256 * 1024, 9)
    let sent = 0

    // Sans Content-Length : seul le comptage des octets reçus peut le refuser
    const res = await fetch(`${API}/tasks/${task.id}/documents?name=morceaux.bin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new ReadableStream({
        pull(stream) {
          if (sent === 5) {
            stream.close()
            return
          }
          sent += 1
          stream.enqueue(chunk)
        },
      }),
      duplex: 'half',
    } as RequestInit)

    expect(res.status).toBe(413)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0, uploads: 0 })
  })

  test('les réglages restent dans leurs bornes', async ({ page }) => {
    await expect(setDocumentLimits(page, { documentMaxSizeMb: 1025 })).rejects.toThrow()
    await expect(setDocumentLimits(page, { documentMaxSizeMb: 0 })).rejects.toThrow()
    await expect(setDocumentLimits(page, { documentMaxPerTask: 101 })).rejects.toThrow()
    await expect(setDocumentLimits(page, { documentMaxPerTask: 0 })).rejects.toThrow()
  })
})

test.describe('Lecture', () => {
  test('le contenu est toujours servi en pièce jointe binaire', async ({ page }) => {
    const task = await createTask(page.request)
    const saved = await addDocument(page.request, task.id, 'été 2026.html', '<script>alert(1)</script>')

    const res = await page.request.get(`${API}/documents/${saved.documents[0].id}/content`)

    const headers = res.headers()
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-disposition']).toBe("attachment; filename*=UTF-8''%C3%A9t%C3%A9%202026.html")
  })

  test('un document inconnu répond 404', async ({ page }) => {
    const res = await page.request.get(`${API}/documents/999999/content`)

    expect(res.status()).toBe(404)
    expect((await res.json()).code).toBe('documentNotFound')
  })

  test('un fichier absent du disque le dit, et le document reste supprimable', async ({ page }) => {
    const task = await createTask(page.request)
    const saved = await addDocument(page.request, task.id, 'a.txt', 'perdu')
    const { directory } = await documentStoreState(page.request)
    const sha256 = sha256Of('perdu')
    fs.rmSync(path.join(directory, sha256.slice(0, 2), sha256))

    const res = await page.request.get(`${API}/documents/${saved.documents[0].id}/content`)
    expect(res.status()).toBe(404)
    expect((await res.json()).code).toBe('fileMissing')

    const deleted = await page.request.delete(`${API}/documents/${saved.documents[0].id}`)
    expect(deleted.ok()).toBeTruthy()
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })
  })

  test('une empreinte hors format en base ne sort jamais du dossier', async ({ page }) => {
    const task = await createTask(page.request)
    const { directory } = await documentStoreState(page.request)
    const canary = `${directory}-canari.txt`
    fs.writeFileSync(canary, 'à garder')

    try {
      const row = await page.request.post(`${API}/test/document-row`, {
        data: { taskId: task.id, size: 1, sha256: `../${path.basename(canary)}` },
      })
      const { id } = (await row.json()) as { id: number }

      expect((await page.request.get(`${API}/documents/${id}/content`)).status()).toBe(404)
      expect((await page.request.delete(`${API}/documents/${id}`)).ok()).toBeTruthy()
      expect(fs.existsSync(canary)).toBe(true)
    } finally {
      fs.rmSync(canary, { force: true })
    }
  })

  test('l’usage compte chaque contenu une fois, y compris au-delà de 2 Go', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', '12345')
    await addDocument(page.request, task.id, 'b.txt', '12345')

    let usage = await (await page.request.get(`${API}/documents/usage`)).json()
    expect(usage).toEqual({ documents: 2, totalBytes: 5 })

    for (const sha256 of ['grand-1', 'grand-2', 'grand-3']) {
      await page.request.post(`${API}/test/document-row`, {
        data: { taskId: task.id, size: 1024 * MB, sha256 },
      })
    }

    usage = await (await page.request.get(`${API}/documents/usage`)).json()
    expect(usage).toEqual({ documents: 5, totalBytes: 3 * 1024 * MB + 5 })
  })
})

test.describe('Suppression', () => {
  test('supprimer un document retire sa ligne et son fichier', async ({ page }) => {
    const task = await createTask(page.request)
    const saved = await addDocument(page.request, task.id, 'a.txt', 'a')
    await addDocument(page.request, task.id, 'b.txt', 'b')

    const res = await page.request.delete(`${API}/documents/${saved.documents[0].id}`)

    expect(res.ok()).toBeTruthy()
    expect(((await res.json()) as DocumentTask).documents.map((document) => document.name)).toEqual(['b.txt'])
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
    expect((await page.request.delete(`${API}/documents/${saved.documents[0].id}`)).status()).toBe(404)
  })

  test('un fichier partagé reste tant qu’un document le référence', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'partagé')
    const saved = await addDocument(page.request, task.id, 'b.txt', 'partagé')
    const [first, second] = saved.documents

    await page.request.delete(`${API}/documents/${first.id}`)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
    expect((await documentContent(page.request, second.id)).toString()).toBe('partagé')

    await page.request.delete(`${API}/documents/${second.id}`)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })
  })

  test('supprimer une tâche emporte ses documents et leurs fichiers', async ({ page }) => {
    const task = await createTask(page.request)
    const other = await createTask(page.request, 'Autre')
    await addDocument(page.request, task.id, 'a.txt', 'a')
    await addDocument(page.request, task.id, 'b.txt', 'b')
    await addDocument(page.request, other.id, 'c.txt', 'c')

    const res = await page.request.delete(`${API}/tasks/${task.id}`)

    expect(res.ok()).toBeTruthy()
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('la purge des archives emporte les documents des tâches purgées seulement', async ({ page }) => {
    await page.evaluate(() => (globalThis as any).settings.set('archivePurgeEnabled', true))
    const old = await createTask(page.request, 'Ancienne')
    const recent = await createTask(page.request, 'Récente')
    await addDocument(page.request, old.id, 'ancien.txt', 'ancien')
    await addDocument(page.request, recent.id, 'recent.txt', 'récent')
    await archiveTask(page.request, old.id, localDate(-200))
    await archiveTask(page.request, recent.id, localDate(-1))

    const res = await page.request.post(`${API}/test/run-archive-purge`, { data: {} })

    expect((await res.json()).count).toBe(1)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('une maintenance ne supprime pas un fichier que rien ne référence', async ({ page }) => {
    const res = await page.request.put(`${API}/documents/files/${sha256Of('arrivé avant sa base')}`, {
      headers: { 'Content-Type': 'application/octet-stream' },
      data: Buffer.from('arrivé avant sa base'),
    })
    expect(res.ok()).toBeTruthy()

    await page.evaluate(() => (globalThis as any).settings.set('archivePurgeEnabled', true))
    await page.request.post(`${API}/test/run-archive-purge`, { data: {} })
    await page.request.post(`${API}/test/run-backup`, { data: {} })
    await page.request.post(`${API}/test/clear-document-uploads`, {
      data: { now: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() },
    })

    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 1 })
  })

  test('un import remplace les documents et retire leurs fichiers', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')
    const exported = await (await page.request.get(`${API}/data/export`)).json()
    // Données importées sans ce document : son fichier ne sert plus
    const tasks = (exported.tasks as { documents?: unknown[] }[]).map((exportedTask) => ({
      ...exportedTask,
      documents: [],
    }))

    const res = await page.request.post(`${API}/data/import`, { data: { ...exported, tasks } })

    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })
  })

  test('un import refusé garde les documents', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')
    const exported = await (await page.request.get(`${API}/data/export`)).json()

    const res = await page.request.post(`${API}/data/import`, { data: { ...exported, format: 'autre' } })

    expect(res.status()).toBe(400)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('un envoi interrompu ancien est retiré au démarrage, pas un envoi récent', async ({ page }) => {
    const { directory } = await documentStoreState(page.request)
    const uploads = path.join(directory, 'tmp')
    fs.mkdirSync(uploads, { recursive: true })
    fs.writeFileSync(path.join(uploads, 'interrompu'), 'partiel')

    const now = (await page.request.post(`${API}/test/clear-document-uploads`, { data: {} })).json()
    expect((await now).removed).toBe(0)

    const later = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
    const res = await page.request.post(`${API}/test/clear-document-uploads`, { data: { now: later } })
    expect((await res.json()).removed).toBe(1)
    expect(await documentStoreState(page.request)).toMatchObject({ uploads: 0 })
  })
})

test.describe('Cycle de vie de la tâche', () => {
  test('les documents survivent à l’archivage et à la restauration', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')

    expect((await archiveTask(page.request, task.id)) as unknown as DocumentTask).toMatchObject({
      documents: [{ name: 'a.txt' }],
    })
    expect((await restoreTask(page.request, task.id)) as unknown as DocumentTask).toMatchObject({
      documents: [{ name: 'a.txt' }],
    })
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('les documents suivent un déplacement vers une autre colonne', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'a')
    const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number }[]
    const target = stages.find((stage) => stage.id !== task.stageId) as { id: number }

    const res = await page.request.post(`${API}/tasks/${task.id}/move`, { data: { stageId: target.id } })

    expect(((await res.json()) as DocumentTask).documents.map((document) => document.name)).toEqual(['a.txt'])
  })

  test('la copie d’une tâche reprend ses documents sur les mêmes fichiers', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'contenu a')
    await addDocument(page.request, task.id, 'b.txt', 'contenu b')

    const res = await page.request.post(`${API}/tasks/${task.id}/duplicate`, { data: { title: 'Copie' } })
    const copy = (await res.json()) as DocumentTask

    expect(copy.documents.map((document) => document.name)).toEqual(['a.txt', 'b.txt'])
    expect((await documentContent(page.request, copy.documents[1].id)).toString()).toBe('contenu b')
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 4, files: 2 })

    // Supprimer l'original ne retire pas les fichiers de la copie
    await page.request.delete(`${API}/tasks/${task.id}`)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 2, files: 2 })
    expect((await documentContent(page.request, copy.documents[0].id)).toString()).toBe('contenu a')

    await page.request.delete(`${API}/tasks/${copy.id}`)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 0 })
  })

  test('une occurrence générée ne reprend aucun document', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Série',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await addDocument(page.request, origin.id, 'a.txt', 'a')

    await runRecurrences(page.request, localDate(2, 12))

    const [, generated] = (await seriesTasks(page.request, origin.recurrenceId!)) as unknown as DocumentTask[]
    expect(generated.documents).toEqual([])
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('annuler un archivage garde l’occurrence suivante si elle a un document', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Après archivage',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1 },
    })
    await archiveTask(page.request, origin.id, localDate(-3, 18))
    await runRecurrences(page.request, new Date())
    const [, second] = await seriesTasks(page.request, origin.recurrenceId!)
    await addDocument(page.request, second.id, 'a.txt', 'a')

    expect((await restoreTask(page.request, origin.id)).removedOccurrenceId).toBeNull()
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 1, files: 1 })
  })

  test('sans document, l’occurrence suivante est bien retirée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Après archivage',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1 },
    })
    await archiveTask(page.request, origin.id, localDate(-3, 18))
    await runRecurrences(page.request, new Date())
    const [, second] = await seriesTasks(page.request, origin.recurrenceId!)

    expect((await restoreTask(page.request, origin.id)).removedOccurrenceId).toBe(second.id)
  })
})

test.describe('Dépôt par empreinte', () => {
  const headers = { 'Content-Type': 'application/octet-stream' }

  test('un contenu se dépose, se relit, et ne se recrée pas', async ({ page }) => {
    const content = Buffer.from('contenu déposé')
    const url = `${API}/documents/files/${sha256Of(content)}`

    const first = await page.request.put(url, { headers, data: content })
    expect(await first.json()).toEqual({ created: true, size: content.length })

    const second = await page.request.put(url, { headers, data: content })
    expect(await second.json()).toEqual({ created: false, size: content.length })

    expect(await (await page.request.get(url)).body()).toEqual(content)
    expect(await documentStoreState(page.request)).toMatchObject({ documents: 0, files: 1, uploads: 0 })
  })

  test('une empreinte différente est refusée sans rien laisser', async ({ page }) => {
    const res = await page.request.put(`${API}/documents/files/${sha256Of('annoncé')}`, {
      headers,
      data: Buffer.from('reçu'),
    })

    expect(res.status()).toBe(422)
    expect((await res.json()).code).toBe('damagedFile')
    expect(await documentStoreState(page.request)).toMatchObject({ files: 0, uploads: 0 })
  })

  test('une valeur qui n’est pas une empreinte est refusée', async ({ page }) => {
    const base = `${API}/documents/files`

    expect((await page.request.get(`${base}/abc`)).status()).toBe(400)
    expect((await page.request.get(`${base}/${'A'.repeat(64)}`)).status()).toBe(400)
    expect((await page.request.delete(`${base}/${'.'.repeat(64)}`)).status()).toBe(400)
  })

  test('un contenu absent répond 404', async ({ page }) => {
    const res = await page.request.get(`${API}/documents/files/${sha256Of('absent')}`)

    expect(res.status()).toBe(404)
    expect((await res.json()).code).toBe('fileMissing')
  })

  test('un contenu ne se retire que si rien ne le référence', async ({ page }) => {
    const task = await createTask(page.request)
    await addDocument(page.request, task.id, 'a.txt', 'référencé')
    const url = `${API}/documents/files/${sha256Of('référencé')}`

    const refused = await page.request.delete(url)
    expect(refused.status()).toBe(409)
    expect((await refused.json()).code).toBe('fileReferenced')
    expect(await documentStoreState(page.request)).toMatchObject({ files: 1 })

    await page.request.delete(`${API}/tasks/${task.id}`)
    await page.request.put(url, { headers, data: Buffer.from('référencé') })
    expect((await page.request.delete(url)).ok()).toBeTruthy()
    expect(await documentStoreState(page.request)).toMatchObject({ files: 0 })
  })
})
