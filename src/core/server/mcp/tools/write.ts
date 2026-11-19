import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { LABEL_MAX_LENGTH } from '../../../shared/validation.constants.js'
import type { ChecklistItemInput } from '../../../shared/checklist.constants.js'
import { runTool, type ToolContext } from '../context.js'
import { taskDetail, taskSummary } from '../format.js'
import { firstStage, loadWorkspace, resolveBoard, resolveStage, ToolError, type Workspace } from '../resolve.js'
import type { ApiChecklistTemplate, ApiStage, ApiTask } from '../types.js'
import { refSchema } from './read.js'

/**
 * Outils d'écriture : capture, création, modification, déplacement, archivage
 * et checklist. Aucun ne supprime : l'archive est réversible (`restore_task`).
 */

/** Heure donnée à une date sans heure, comme les raccourcis de date de l'app. */
export const DEFAULT_START_HOUR = 9

/** Point de checklist d'un modèle, tel que GET /checklist-templates le rend. */
interface TemplateWithItems extends ApiChecklistTemplate {
  items: { text: string }[]
}

/**
 * Date saisie par l'assistant : jour seul (`2026-11-20`, à 9 h locales), jour et
 * heure locale (`2026-11-20T14:30`), ou ISO 8601 complète avec fuseau.
 *
 * @param value Date saisie
 * @returns La date en ISO (UTC), comme l'API l'attend
 * @throws {ToolError} Date illisible
 */
export function parseTaskDate(value: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  let date: Date
  if (day) date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), DEFAULT_START_HOUR)
  else if (local) {
    date = new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]))
  } else date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ToolError(`Invalid date "${value}". Use YYYY-MM-DD, YYYY-MM-DDTHH:mm (local time) or ISO 8601.`)
  }
  return date.toISOString()
}

/**
 * Titre et description tirés d'un texte capturé : première ligne non vide,
 * puis le reste.
 *
 * @param text Texte capturé
 * @throws {ToolError} Texte vide ou première ligne trop longue
 */
export function splitCapture(text: string): { title: string; description: string } {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const first = lines.findIndex((line) => line.trim())
  if (first === -1) throw new ToolError('Nothing to capture: the text is empty.')
  const title = lines[first].trim()
  if (title.length > LABEL_MAX_LENGTH) {
    throw new ToolError(`The first line becomes the title and is limited to ${LABEL_MAX_LENGTH} characters.`)
  }
  return {
    title,
    description: lines
      .slice(first + 1)
      .join('\n')
      .trim(),
  }
}

/**
 * Colonne visée par une création : la colonne donnée, sinon la première du
 * tableau donné, sinon la première du premier tableau.
 *
 * @param workspace Tableaux et colonnes
 * @param column Colonne demandée
 * @param board Tableau demandé
 */
function targetStage(workspace: Workspace, column?: string | number, board?: string | number): ApiStage {
  if (column !== undefined) return resolveStage(workspace, column, board)
  if (board !== undefined) return firstStage(workspace, resolveBoard(workspace, board))
  const [first] = workspace.boards
  if (!first) throw new ToolError('There is no board yet.')
  return firstStage(workspace, first)
}

/**
 * Noms de tags, sans doublon (casse ignorée), dans l'ordre donné.
 *
 * @param names Noms
 */
function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  return names
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase()
      if (!name || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * Enregistre les outils d'écriture.
 *
 * @param server Serveur MCP
 * @param context Contexte des outils
 */
export function registerWriteTools(server: McpServer, { api }: ToolContext): void {
  server.registerTool(
    'capture',
    {
      title: 'Capture',
      description:
        'Quickly capture an idea, a note or a to-do as a new task: the first line becomes the title, the rest the ' +
        'Markdown description. Lands in the first column of `board`, or where the app quick add puts tasks (last ' +
        'board shown). Prefer it for anything said in passing; use create_task for a fully specified task.',
      inputSchema: {
        text: z.string().min(1).describe('First line: title. Following lines: description (Markdown)'),
        board: refSchema.optional().describe('Board name or id'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('capture', async () => {
        const { title, description } = splitCapture(args.text)
        const workspace = await loadWorkspace(api)
        const stageId =
          args.board === undefined ? undefined : firstStage(workspace, resolveBoard(workspace, args.board)).id

        let task = await api.send<ApiTask>('POST', '/tasks/quick-add', { title, ...(stageId ? { stageId } : {}) })
        if (description) task = await api.send<ApiTask>('PATCH', `/tasks/${task.id}`, { description })
        return taskSummary(task, workspace)
      }),
  )

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task with its details. Placed in `column` (of `board` if several boards have it), else in the ' +
        'first column of `board`, else of the first board. Unknown tags are created.',
      inputSchema: {
        title: z.string().min(1).max(LABEL_MAX_LENGTH),
        description: z.string().optional().describe('Markdown'),
        board: refSchema.optional().describe('Board name or id'),
        column: refSchema.optional().describe('Column name or id'),
        tags: z.array(z.string().min(1)).optional().describe('Tag names'),
        date: z
          .string()
          .optional()
          .describe('Planned date, with a reminder: YYYY-MM-DD (9:00), YYYY-MM-DDTHH:mm (local time) or ISO 8601'),
        checklist: z.array(z.string().min(1)).optional().describe('Checklist items, unchecked'),
        checklistTemplate: refSchema.optional().describe('Checklist template name or id, items added first'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('create_task', async () => {
        const workspace = await loadWorkspace(api)
        const stage = targetStage(workspace, args.column, args.board)

        const items: ChecklistItemInput[] = []
        if (args.checklistTemplate !== undefined) {
          const templates = await api.get<TemplateWithItems[]>('/checklist-templates')
          const ref = String(args.checklistTemplate).trim().toLowerCase()
          const template =
            templates.find((item) => item.name.toLowerCase() === ref) ??
            templates.find((item) => String(item.id) === ref)
          if (!template) {
            const names = templates.map((item) => `"${item.name}"`).join(', ') || 'none'
            throw new ToolError(`Unknown checklist template "${args.checklistTemplate}". Available: ${names}.`)
          }
          items.push(...template.items.map((item) => ({ text: item.text, isChecked: false })))
        }
        items.push(...(args.checklist ?? []).map((text) => ({ text, isChecked: false })))

        const task = await api.send<ApiTask>('POST', '/tasks', {
          stageId: stage.id,
          title: args.title.trim(),
          description: args.description ?? '',
          ...(args.tags ? { tags: uniqueNames(args.tags) } : {}),
          ...(args.date ? { startDate: parseTaskDate(args.date) } : {}),
          ...(items.length ? { checklistItems: items } : {}),
        })
        return taskDetail(task, workspace)
      }),
  )

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Change a task: title, description (replaced, or `appendToDescription` to add a paragraph at the end, e.g. ' +
        'a journal entry), date (null removes it), tags (`tags` replaces them all, `addTags` / `removeTags` edit ' +
        'them). Fields left out stay unchanged.',
      inputSchema: {
        id: z.number().int().describe('Task id'),
        title: z.string().min(1).max(LABEL_MAX_LENGTH).optional(),
        description: z.string().optional().describe('New Markdown description, replaces the current one'),
        appendToDescription: z.string().min(1).optional().describe('Markdown added at the end of the description'),
        date: z.string().nullable().optional().describe('YYYY-MM-DD, YYYY-MM-DDTHH:mm, ISO 8601, or null'),
        tags: z.array(z.string().min(1)).optional().describe('Tag names, replace all tags'),
        addTags: z.array(z.string().min(1)).optional(),
        removeTags: z.array(z.string().min(1)).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('update_task', async () => {
        if (args.description !== undefined && args.appendToDescription !== undefined) {
          throw new ToolError('Pass either description or appendToDescription, not both.')
        }
        const [workspace, current] = await Promise.all([loadWorkspace(api), api.get<ApiTask>(`/tasks/${args.id}`)])

        const body: Record<string, unknown> = {}
        if (args.title !== undefined) body.title = args.title.trim()
        if (args.description !== undefined) body.description = args.description
        if (args.appendToDescription !== undefined) {
          const base = current.description.trimEnd()
          body.description = base ? `${base}\n\n${args.appendToDescription}` : args.appendToDescription
        }
        if (args.date !== undefined) body.startDate = args.date === null ? null : parseTaskDate(args.date)

        if (args.tags || args.addTags || args.removeTags) {
          const removed = new Set((args.removeTags ?? []).map((name) => name.trim().toLowerCase()))
          const base = args.tags ?? (current.tags ?? []).map((tag) => tag.name)
          body.tags = uniqueNames([...base, ...(args.addTags ?? [])]).filter((name) => !removed.has(name.toLowerCase()))
        }

        if (!Object.keys(body).length) throw new ToolError('Nothing to change.')
        return taskDetail(await api.send<ApiTask>('PATCH', `/tasks/${args.id}`, body), workspace)
      }),
  )

  server.registerTool(
    'move_task',
    {
      title: 'Move task',
      description: 'Move an active task to a column, of another board if needed, at the top or the bottom.',
      inputSchema: {
        id: z.number().int().describe('Task id'),
        column: refSchema.describe('Column name or id'),
        board: refSchema.optional().describe('Board name or id, needed if several boards have this column'),
        position: z.enum(['top', 'bottom']).default('bottom'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      runTool('move_task', async () => {
        const workspace = await loadWorkspace(api)
        const stage = resolveStage(workspace, args.column, args.board)
        const task = await api.send<ApiTask>('POST', `/tasks/${args.id}/move`, {
          stageId: stage.id,
          ...(args.position === 'top' ? { position: 0 } : {}),
        })
        return taskSummary(task, workspace)
      }),
  )

  server.registerTool(
    'archive_task',
    {
      title: 'Archive task',
      description: 'Archive a task: in NexTask, archiving means done. Reversible with restore_task.',
      inputSchema: { id: z.number().int().describe('Task id') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) =>
      runTool('archive_task', async () => {
        const task = await api.get<ApiTask>(`/tasks/${id}`)
        if (task.isHistorized) return { id, title: task.title, archived: true, note: 'Already archived.' }
        await api.send('PUT', `/tasks/${id}`)
        return { id, title: task.title, archived: true }
      }),
  )

  server.registerTool(
    'restore_task',
    {
      title: 'Restore task',
      description:
        'Bring an archived task back to a board: at the bottom of `column`, else of the first column of its board.',
      inputSchema: {
        id: z.number().int().describe('Task id'),
        column: refSchema.optional().describe('Column name or id'),
        board: refSchema.optional().describe('Board name or id'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('restore_task', async () => {
        const workspace = await loadWorkspace(api)
        let query = ''
        if (args.column !== undefined) {
          const stage = resolveStage(workspace, args.column, args.board)
          query = `?stageId=${stage.id}&position=${stage.tasks?.length ?? 0}`
        } else if (args.board !== undefined) {
          query = `?boardId=${resolveBoard(workspace, args.board).id}`
        }
        const task = await api.send<ApiTask>('POST', `/tasks/${args.id}/restore${query}`)
        // Colonnes relues : la restauration a pu en créer une dans un tableau vide
        return taskSummary(task, await loadWorkspace(api))
      }),
  )

  server.registerTool(
    'update_checklist',
    {
      title: 'Update checklist',
      description:
        "Edit a task's checklist: add items at the end, check, uncheck or remove items by id (ids from get_task).",
      inputSchema: {
        taskId: z.number().int(),
        add: z.array(z.string().min(1)).optional().describe('Texts of new unchecked items'),
        check: z.array(z.number().int()).optional().describe('Item ids to check'),
        uncheck: z.array(z.number().int()).optional().describe('Item ids to uncheck'),
        remove: z.array(z.number().int()).optional().describe('Item ids to remove'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      runTool('update_checklist', async () => {
        const [workspace, task] = await Promise.all([loadWorkspace(api), api.get<ApiTask>(`/tasks/${args.taskId}`)])
        const current = task.checklist?.items ?? []

        const known = new Set(current.map((item) => item.id))
        const unknown = [...(args.check ?? []), ...(args.uncheck ?? []), ...(args.remove ?? [])].filter(
          (id) => !known.has(id),
        )
        if (unknown.length) {
          const ids = current.map((item) => `${item.id} "${item.text}"`).join(', ') || 'none'
          throw new ToolError(`Unknown checklist item(s) ${unknown.join(', ')}. Items of this task: ${ids}.`)
        }

        const checked = new Set(args.check)
        const unchecked = new Set(args.uncheck)
        const removed = new Set(args.remove)
        const items: ChecklistItemInput[] = [
          ...current
            .filter((item) => !removed.has(item.id))
            .map((item) => {
              let isChecked = item.isChecked
              if (checked.has(item.id)) isChecked = true
              if (unchecked.has(item.id)) isChecked = false
              return { id: item.id, text: item.text, isChecked }
            }),
          ...(args.add ?? []).map((text) => ({ text, isChecked: false })),
        ]

        const updated = await api.send<ApiTask>('PATCH', `/tasks/${args.taskId}`, { checklistItems: items })
        return taskDetail(updated, workspace)
      }),
  )
}
