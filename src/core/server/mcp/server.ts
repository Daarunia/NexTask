import { McpServer } from '@modelcontextprotocol/server'
import type { ToolContext } from './context.js'
import { registerPrompts } from './prompts.js'
import { registerDocumentTools } from './tools/documents.js'
import { registerReadTools } from './tools/read.js'
import { registerWriteTools } from './tools/write.js'

/**
 * Serveur MCP de NexTask : outils, prompts et consignes, sans transport. Un
 * serveur neuf sert chaque requête HTTP (cf. index.ts), et les tests le
 * branchent sur un transport en mémoire.
 */

/** Nom du serveur annoncé aux clients MCP. */
export const MCP_SERVER_NAME = 'nextask'

/** Nom affiché par les clients MCP qui savent montrer un titre. */
export const MCP_SERVER_TITLE = 'NexTask'

/** Site de l'app, annoncé aux clients. */
export const MCP_WEBSITE_URL = 'https://daarunia.github.io/NexTask/'

/**
 * Icône annoncée aux clients MCP (protocole 2025-11-25) : URL `data:` de
 * l'image, pour rester utilisable hors ligne.
 */
export interface McpIcon {
  src: string
  mimeType: string
  sizes?: string[]
}

/**
 * Icône d'un fichier image, en URL `data:`.
 *
 * @param content Contenu de l'image
 * @param mimeType Type de l'image (`image/png`, `image/svg+xml`)
 * @param sizes Tailles (`256x256`, `any` pour une image vectorielle)
 */
export function iconFrom(content: Buffer, mimeType: string, sizes: string[]): McpIcon {
  return { src: `data:${mimeType};base64,${content.toString('base64')}`, mimeType, sizes }
}

/** Consignes données au modèle à la connexion : le modèle de données de NexTask. */
export const MCP_INSTRUCTIONS = [
  "NexTask is the user's offline Kanban task manager, used as a second brain: tasks, notes, ideas and plans.",
  'Boards contain columns (ordered left to right); columns contain tasks. Archived tasks are done tasks: they leave ' +
    'their column but keep their board, and stay searchable.',
  'A task has a title, a Markdown description, an optional date (planned start, with a reminder), tags, a checklist, ' +
    'attached documents, and may be an occurrence of a recurring series.',
  'Boards, columns and tags are referred to by name (case and accents ignored) or id. Call `overview` first to ' +
    'learn them. Dates are local time with their UTC offset.',
  'Use `capture` for anything the user mentions in passing, `search_tasks` before creating to avoid duplicates, and ' +
    'prefer `archive_task` once something is done. Nothing can be deleted from here.',
].join('\n')

/**
 * Crée un serveur MCP avec tous ses outils et prompts.
 *
 * @param context Accès à l'API et horloge
 * @param version Version de l'app, annoncée aux clients
 * @param icons Icônes de l'app, montrées par les clients qui les affichent
 */
export function createMcpServer(context: ToolContext, version: string, icons: McpIcon[] = []): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      title: MCP_SERVER_TITLE,
      version,
      websiteUrl: MCP_WEBSITE_URL,
      ...(icons.length ? { icons } : {}),
    },
    { instructions: MCP_INSTRUCTIONS },
  )
  registerReadTools(server, context)
  registerWriteTools(server, context)
  registerDocumentTools(server, context)
  registerPrompts(server)
  return server
}
