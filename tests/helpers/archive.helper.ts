import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { EXPORT_ARCHIVE_DATA, EXPORT_ARCHIVE_DOCUMENTS } from '@core/shared/data.constants'

/**
 * Archives d'export (.zip) lues et écrites par les tests E2E : contrôle de ce
 * que l'export écrit, et archives construites à la main pour l'import (contenu
 * manquant ou endommagé).
 */

/** Contenu d'une archive d'export. */
export interface ExportArchive {
  data: unknown // données (EXPORT_ARCHIVE_DATA), déjà lues en JSON
  documents: Map<string, Buffer> // contenus par empreinte
  entries: string[] // chemins de toutes les entrées, dans l'ordre
}

/**
 * Lit une archive d'export.
 * @param file Chemin de l'archive
 */
export async function readExportArchive(file: string): Promise<ExportArchive> {
  const zip = await yauzl.openPromise(file, { lazyEntries: true, autoClose: false })
  try {
    const entries: string[] = []
    const documents = new Map<string, Buffer>()
    let data: unknown = null

    for await (const entry of zip.eachEntry()) {
      entries.push(entry.fileName)
      const chunks: Buffer[] = []
      for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk as Buffer)
      const content = Buffer.concat(chunks)

      if (entry.fileName === EXPORT_ARCHIVE_DATA) data = JSON.parse(content.toString('utf8'))
      else if (entry.fileName.startsWith(EXPORT_ARCHIVE_DOCUMENTS)) {
        documents.set(entry.fileName.slice(EXPORT_ARCHIVE_DOCUMENTS.length), content)
      }
    }
    return { data, documents, entries }
  } finally {
    zip.close()
  }
}

/**
 * Écrit une archive d'export.
 * @param file Chemin de l'archive
 * @param data Données, écrites en JSON (absentes : archive sans données)
 * @param documents Contenus, rangés sous l'empreinte donnée, juste ou non
 */
export async function writeExportArchive(
  file: string,
  data: unknown,
  documents: Record<string, Buffer | string> = {},
): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const zip = new yazl.ZipFile()
  if (data !== undefined) zip.addBuffer(Buffer.from(JSON.stringify(data)), EXPORT_ARCHIVE_DATA)
  for (const [sha256, content] of Object.entries(documents)) {
    zip.addBuffer(Buffer.from(content), `${EXPORT_ARCHIVE_DOCUMENTS}${sha256}`)
  }
  zip.end()
  await pipeline(zip.outputStream, fs.createWriteStream(file))
}
