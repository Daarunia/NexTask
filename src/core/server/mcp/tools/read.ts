import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { dayKey, dayOffset } from '../../../shared/day.helper.js'
import { projectOccurrences } from '../../../shared/occurrence.helper.js'
import {
  normalizeSearchText,
  searchTerms,
  TASK_STATUSES,
  taskHasStatus,
  taskMatchExcerpt,
  taskSearchText,
} from '../../../shared/search.helper.js'
import { runTool, type ToolContext } from '../context.js'
import { localIso, taskDetail, taskSummary } from '../format.js'
import { loadWorkspace, resolveBoard, resolveStage, resolveTags, stagesOf, type Workspace } from '../resolve.js'
import type { ApiRecurrence, ApiTag, ApiTask } from '../types.js'

/**
 * Outils de lecture : vue d'ensemble, recherche, détail d'une tâche, agenda.
 * Aucun n'écrit (`readOnlyHint`).
 */

/** Nombre de tâches rendues par défaut, et au plus, par une recherche. */
export const SEARCH_DEFAULT_LIMIT = 20
export const SEARCH_MAX_LIMIT = 100

/** Jours couverts par défaut, et au plus, par l'agenda. */
export const AGENDA_DEFAULT_DAYS = 7
export const AGENDA_MAX_DAYS = 31

/** Référence à un tableau, une colonne ou un tag : nom ou id. */
export const refSchema = z.union([z.string().min(1), z.number().int()])

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** Archives retenues par une recherche. */
const ARCHIVED_MODES = ['exclude', 'only', 'include'] as const
type ArchivedMode = (typeof ARCHIVED_MODES)[number]

/**
 * Tâches actives, archivées ou toutes.
 *
 * @param context Contexte de l'outil
 * @param archived Archives retenues
 */
function loadTasks({ api }: ToolContext, archived: ArchivedMode): Promise<ApiTask[]> {
  if (archived === 'include') return api.get<ApiTask[]>('/tasks')
  return api.get<ApiTask[]>(`/tasks?isHistorized=${archived === 'only'}`)
}

/**
 * Comparateur de l'ordre du tableau : tableau, colonne, puis position dans la colonne.
 *
 * @param workspace Tableaux et colonnes
 */
function boardOrder(workspace: Workspace): (a: ApiTask, b: ApiTask) => number {
  const boardRank = new Map(workspace.boards.map((board, index) => [board.id, index]))
  const stageRank = new Map(workspace.stages.map((stage, index) => [stage.id, index]))
  const rank = (task: ApiTask) => [
    boardRank.get(task.boardId ?? -1) ?? Infinity,
    stageRank.get(task.stageId ?? -1) ?? Infinity,
    task.position,
  ]
  return (a, b) => {
    const [ra, rb] = [rank(a), rank(b)]
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]
  }
}

/**
 * Instant situé un nombre de jours avant un autre.
 *
 * @param date Instant de référence
 * @param days Jours à retirer
 */
export function daysBefore(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}

/**
 * Archives les plus récentes d'abord.
 *
 * @param a Tâche
 * @param b Tâche
 */
function archiveOrder(a: ApiTask, b: ApiTask): number {
  return (b.historizationDate ?? '').localeCompare(a.historizationDate ?? '') || b.id - a.id
}

/**
 * Enregistre les outils de lecture.
 *
 * @param server Serveur MCP
 * @param context Contexte des outils
 */
export function registerReadTools(server: McpServer, context: ToolContext): void {
  const { api, now } = context

  server.registerTool(
    'overview',
    {
      title: 'NexTask overview',
      description:
        'Map of the NexTask workspace: boards with their columns and active task counts, tags, archived and recurring ' +
        'task counts, and the current local time. Call it first to learn board and column names.',
      annotations: READ_ONLY,
    },
    () =>
      runTool('overview', async () => {
        const [workspace, tags, archived, series] = await Promise.all([
          loadWorkspace(api),
          api.get<ApiTag[]>('/tags'),
          api.get<ApiTask[]>('/tasks?isHistorized=true'),
          api.get<ApiRecurrence[]>('/recurrences'),
        ])
        return {
          now: localIso(now()),
          boards: workspace.boards.map((board) => ({
            id: board.id,
            name: board.name,
            columns: stagesOf(workspace, board.id).map((stage) => ({
              id: stage.id,
              name: stage.name,
              tasks: stage.tasks?.length ?? 0,
            })),
          })),
          tags: tags.map((tag) => ({ name: tag.name, tasks: tag.taskCount ?? 0 })),
          archivedTasks: archived.length,
          activeSeries: series.filter((item) => item.status === 'active').length,
        }
      }),
  )

  server.registerTool(
    'search_tasks',
    {
      title: 'Search tasks',
      description:
        'Find tasks by words (title, description, checklist; case and accents ignored, all words required), board, ' +
        'column, tags (all required) and status. Active tasks only unless `archived` says otherwise. Archived tasks ' +
        'are done tasks: search them to recall past work. Returns summaries; call get_task for the full content.',
      inputSchema: z.object({
        query: z.string().optional().describe('Words to find'),
        board: refSchema.optional().describe('Board name or id'),
        column: refSchema.optional().describe('Column name or id'),
        tags: z.array(refSchema).optional().describe('Tag names or ids, all required'),
        status: z
          .enum(TASK_STATUSES)
          .optional()
          .describe(
            'overdue: date before today; today; upcoming: date in the next 7 days; checklist: unchecked items left',
          ),
        archived: z.enum(ARCHIVED_MODES).default('exclude').describe('exclude (default), only, or include'),
        archivedWithinDays: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Only tasks archived in the last N days (implies archived: only unless include)'),
        notUpdatedForDays: z.number().int().min(1).optional().describe('Only tasks not modified for N days or more'),
        limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
      }),
      annotations: READ_ONLY,
    },
    (args) =>
      runTool('search_tasks', async () => {
        // Une période d'archivage ne porte que sur les archives, sauf demande explicite de tout inclure
        const archived = args.archivedWithinDays && args.archived === 'exclude' ? 'only' : args.archived
        const [workspace, tasks, allTags] = await Promise.all([
          loadWorkspace(api),
          loadTasks(context, archived),
          args.tags?.length ? api.get<ApiTag[]>('/tags') : Promise.resolve([]),
        ])
        const board = args.board === undefined ? null : resolveBoard(workspace, args.board)
        const stage = args.column === undefined ? null : resolveStage(workspace, args.column, args.board)
        const tagIds = resolveTags(allTags, args.tags ?? []).map((tag) => tag.id)
        const terms = searchTerms(args.query ?? '')
        const at = now()
        const archivedSince = args.archivedWithinDays ? daysBefore(at, args.archivedWithinDays) : null
        const updatedBefore = args.notUpdatedForDays ? daysBefore(at, args.notUpdatedForDays) : null

        const found = tasks.filter(
          (task) =>
            (!board || task.boardId === board.id) &&
            (!stage || task.stageId === stage.id) &&
            tagIds.every((id) => task.tags?.some((tag) => tag.id === id)) &&
            (!args.status || taskHasStatus(task, args.status, at)) &&
            (!archivedSince || (!!task.historizationDate && new Date(task.historizationDate) >= archivedSince)) &&
            (!updatedBefore || new Date(task.updatedAt) <= updatedBefore) &&
            terms.every((term) => taskSearchText(task).includes(term)),
        )

        // Ordre du tableau, archives les plus récentes d'abord, puis les titres qui contiennent les mots en tête
        const inTitle = (task: ApiTask) => terms.every((term) => normalizeSearchText(task.title).includes(term))
        const order = boardOrder(workspace)
        found.sort(
          (a, b) =>
            (terms.length ? Number(inTitle(b)) - Number(inTitle(a)) : 0) ||
            Number(a.isHistorized) - Number(b.isHistorized) ||
            (a.isHistorized ? archiveOrder(a, b) : order(a, b)),
        )

        return {
          total: found.length,
          tasks: found
            .slice(0, args.limit)
            .map((task) => taskSummary(task, workspace, terms.length ? taskMatchExcerpt(task, terms, 60) : undefined)),
        }
      }),
  )

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description:
        'Full content of a task: Markdown description, checklist items with their ids, tags, attached documents, ' +
        'recurrence and dates.',
      inputSchema: z.object({ id: z.number().int().describe('Task id') }),
      annotations: READ_ONLY,
    },
    ({ id }) =>
      runTool('get_task', async () => {
        const [workspace, task] = await Promise.all([loadWorkspace(api), api.get<ApiTask>(`/tasks/${id}`)])
        return taskDetail(task, workspace)
      }),
  )

  server.registerTool(
    'agenda',
    {
      title: 'Agenda',
      description:
        'Overdue active tasks, then for each day of the period the dated tasks and the upcoming occurrences of ' +
        'recurring series (not created yet). Days without anything are left out.',
      inputSchema: z.object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('First day, YYYY-MM-DD (default: today)'),
        days: z.number().int().min(1).max(AGENDA_MAX_DAYS).default(AGENDA_DEFAULT_DAYS),
        board: refSchema.optional().describe('Board name or id'),
      }),
      annotations: READ_ONLY,
    },
    (args) =>
      runTool('agenda', async () => {
        const [workspace, tasks, series] = await Promise.all([
          loadWorkspace(api),
          api.get<ApiTask[]>('/tasks?isHistorized=false'),
          api.get<ApiRecurrence[]>('/recurrences'),
        ])
        const board = args.board === undefined ? null : resolveBoard(workspace, args.board)
        const at = now()

        const [year, month, day] = (args.from ?? dayKey(at)).split('-').map(Number)
        const start = new Date(year, month - 1, day)
        const end = new Date(year, month - 1, day + args.days)

        const dated = tasks
          .filter((task) => task.startDate && (!board || task.boardId === board.id))
          .sort((a, b) => (a.startDate as string).localeCompare(b.startDate as string))
        const overdue = dated.filter((task) => dayOffset(new Date(task.startDate as string), at) < 0)

        const days = new Map<
          string,
          { tasks: ApiTask[]; occurrences: { series: number; title: string; time: string }[] }
        >()
        const dayOf = (key: string) => {
          if (!days.has(key)) days.set(key, { tasks: [], occurrences: [] })
          return days.get(key) as { tasks: ApiTask[]; occurrences: { series: number; title: string; time: string }[] }
        }

        for (const task of dated) {
          const date = new Date(task.startDate as string)
          if (date >= start && date < end && !overdue.includes(task)) dayOf(dayKey(date)).tasks.push(task)
        }
        for (const item of series) {
          if (board && item.boardId !== board.id) continue
          for (const occurrence of projectOccurrences(item, start, end)) {
            dayOf(dayKey(occurrence.date)).occurrences.push({
              series: occurrence.seriesId,
              title: occurrence.title,
              time: localIso(occurrence.date).slice(11, 16),
            })
          }
        }

        return {
          today: dayKey(at),
          overdue: overdue.map((task) => taskSummary(task, workspace)),
          days: [...days.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, content]) => ({
              date,
              tasks: content.tasks.map((task) => taskSummary(task, workspace)),
              upcomingOccurrences: content.occurrences,
            })),
        }
      }),
  )
}
