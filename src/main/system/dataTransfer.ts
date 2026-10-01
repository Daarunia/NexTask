import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, type BrowserWindow, dialog } from 'electron'
import Logger from 'electron-log'
import { getApiUrl } from '../server/index.js'
import type { DataCounts, DataTransferResult } from '../shared/data.constants.js'

/**
 * Export et import des données vers et depuis un fichier, à la demande du
 * renderer (IPC). Le main ne s'occupe que du système : boîtes de dialogue
 * natives et lecture ou écriture du fichier. Les données passent par les
 * routes /data du serveur, seules à les lire, les valider et les écrire.
 */

// Filtre des boîtes de dialogue
const JSON_FILTERS = [{ name: 'Export NexTask', extensions: ['json'] }]

/**
 * Nom proposé pour un export : `nextask-AAAA-MM-JJ.json`, à la date du jour.
 */
function defaultExportName(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `nextask-${now.getFullYear()}-${month}-${day}.json`
}

/**
 * Message d'erreur renvoyé par une route, ou le statut HTTP à défaut.
 *
 * @param response Réponse en erreur
 */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/**
 * Exporte toutes les données dans un fichier JSON choisi par l'utilisateur.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 * @returns `canceled` sans fichier choisi, sinon `done` avec le chemin et le nombre d'éléments
 */
export async function exportDataToFile(window: BrowserWindow | null): Promise<DataTransferResult> {
  const options = {
    title: 'Exporter les données',
    defaultPath: path.join(app.getPath('documents'), defaultExportName()),
    filters: JSON_FILTERS,
  }
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return { status: 'canceled' }

  const response = await fetch(`${getApiUrl()}/data/export`)
  if (!response.ok) throw new Error(`Export impossible : ${await errorMessage(response)}`)

  const data = (await response.json()) as { stages: unknown[]; tags: unknown[]; tasks: unknown[] }
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')

  const counts: DataCounts = { stages: data.stages.length, tags: data.tags.length, tasks: data.tasks.length }
  Logger.info(`Données exportées dans ${filePath}`, counts)
  return { status: 'done', filePath, counts }
}

/**
 * Remplace toutes les données par celles d'un fichier d'export choisi par
 * l'utilisateur. La confirmation est demandée par le renderer avant l'appel.
 * Un fichier illisible ou refusé par le serveur ne modifie rien.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 * @returns `canceled` sans fichier choisi, `invalid` avec le motif du refus, sinon `done`
 */
export async function importDataFromFile(window: BrowserWindow | null): Promise<DataTransferResult> {
  const options = {
    title: 'Importer des données',
    filters: JSON_FILTERS,
    properties: ['openFile' as const],
  }
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const [filePath] = filePaths
  if (canceled || !filePath) return { status: 'canceled' }

  // Contrôlé ici pour un message en français, le serveur refusant aussi un JSON invalide
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
    JSON.parse(content)
  } catch (error) {
    Logger.warn(`Import refusé, fichier illisible ou JSON invalide : ${filePath}`, error)
    return { status: 'invalid', message: "Le fichier n'est pas un fichier JSON lisible" }
  }

  const response = await fetch(`${getApiUrl()}/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })

  if (response.status === 400) {
    const message = await errorMessage(response)
    Logger.warn(`Import refusé : ${message}`)
    return { status: 'invalid', message }
  }
  if (!response.ok) throw new Error(`Import impossible : ${await errorMessage(response)}`)

  const counts = (await response.json()) as DataCounts
  Logger.info(`Données importées depuis ${filePath}`, counts)
  return { status: 'done', filePath, counts }
}
