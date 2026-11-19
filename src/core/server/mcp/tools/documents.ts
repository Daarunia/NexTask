import path from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { runTool, runToolWith, type ToolContext } from '../context.js'
import { taskDetail } from '../format.js'
import { loadWorkspace, ToolError } from '../resolve.js'
import type { ApiTask } from '../types.js'

/**
 * Outils des documents joints : lire un document texte ou une image, joindre
 * une note Markdown à une tâche.
 */

/** Taille maximale d'un document lu comme texte. */
export const TEXT_DOCUMENT_MAX_BYTES = 200 * 1024

/** Taille maximale d'une image rendue à l'assistant. */
export const IMAGE_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024

/** Taille maximale d'une note jointe. */
export const NOTE_MAX_LENGTH = 200 * 1024

/** Extensions lues comme texte (UTF-8). */
export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.csv',
  '.tsv',
  '.json',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.ts',
  '.py',
  '.sql',
  '.sh',
])

/** Images rendues à l'assistant, par extension. */
export const IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
])

/**
 * Nom d'une note jointe : celui donné, avec l'extension `.md` s'il n'en a pas.
 *
 * @param name Nom saisi
 */
export function noteFileName(name: string): string {
  const trimmed = name.trim()
  return path.extname(trimmed) ? trimmed : `${trimmed}.md`
}

/**
 * Enregistre les outils des documents.
 *
 * @param server Serveur MCP
 * @param context Contexte des outils
 */
export function registerDocumentTools(server: McpServer, { api }: ToolContext): void {
  server.registerTool(
    'read_document',
    {
      title: 'Read document',
      description:
        `Read a document attached to a task (ids from get_task). Text files (Markdown, txt, csv, json…) up to ` +
        `${TEXT_DOCUMENT_MAX_BYTES / 1024} KB are returned as text, PNG, JPEG, GIF and WebP images up to ` +
        `${IMAGE_DOCUMENT_MAX_BYTES / 1024 / 1024} MB as images. Other files cannot be read.`,
      inputSchema: {
        taskId: z.number().int().describe('Task id'),
        documentId: z.number().int().describe('Document id'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ taskId, documentId }) =>
      runToolWith('read_document', async () => {
        const task = await api.get<ApiTask>(`/tasks/${taskId}`)
        const document = task.documents?.find((item) => item.id === documentId)
        if (!document) {
          const names = (task.documents ?? []).map((item) => `${item.id} "${item.name}"`).join(', ') || 'none'
          throw new ToolError(`Task ${taskId} has no document ${documentId}. Its documents: ${names}.`)
        }

        const extension = path.extname(document.name).toLowerCase()
        const imageType = IMAGE_TYPES.get(extension)
        const limit = imageType ? IMAGE_DOCUMENT_MAX_BYTES : TEXT_DOCUMENT_MAX_BYTES
        if (!imageType && !TEXT_EXTENSIONS.has(extension)) {
          throw new ToolError(`"${document.name}" is neither a text file nor a supported image.`)
        }
        if (document.size > limit) {
          throw new ToolError(`"${document.name}" is too large to read (${document.size} bytes, limit ${limit}).`)
        }

        const content = await api.download(`/documents/${documentId}/content`)
        if (imageType) return { content: [{ type: 'image', data: content.toString('base64'), mimeType: imageType }] }
        return { content: [{ type: 'text', text: content.toString('utf8') }] }
      }),
  )

  server.registerTool(
    'attach_note',
    {
      title: 'Attach note',
      description:
        'Attach a Markdown note to a task as a document, for content too long for the description (meeting notes, ' +
        'research, drafts). `.md` is added to a name without extension.',
      inputSchema: {
        taskId: z.number().int().describe('Task id'),
        name: z.string().min(1).describe('File name'),
        content: z.string().min(1).max(NOTE_MAX_LENGTH).describe('Markdown content'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('attach_note', async () => {
        const name = encodeURIComponent(noteFileName(args.name))
        const [workspace, task] = await Promise.all([
          loadWorkspace(api),
          api.upload<ApiTask>(`/tasks/${args.taskId}/documents?name=${name}`, Buffer.from(args.content, 'utf8')),
        ])
        return taskDetail(task, workspace)
      }),
  )
}
