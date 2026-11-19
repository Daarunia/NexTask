import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'

/**
 * Prompts de revue proposés par le serveur MCP : des points de départ que
 * l'utilisateur lance depuis son assistant (`/mcp__nextask__daily-review` dans
 * Claude Code). L'assistant propose, l'utilisateur décide : aucun prompt ne
 * demande d'écrire sans accord.
 */

/**
 * Message unique d'un prompt.
 *
 * @param text Consigne
 */
function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

/** Rappel commun : proposer avant d'écrire. */
const ASK_FIRST =
  'Do not change anything yet: list your proposals, numbered, and wait for my answer before calling any tool that ' +
  'writes.'

/**
 * Enregistre les prompts.
 *
 * @param server Serveur MCP
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'daily-review',
    {
      title: 'Daily review',
      description: "Today's plan: overdue tasks, today's agenda, and what to reschedule or archive.",
    },
    () =>
      userMessage(
        'Review my day in NexTask. Call `agenda` for today, then sum up in a few lines: what is overdue, what is ' +
          'planned today, and what looks done or stale. Propose for each overdue task a new date, an archive, or ' +
          `keeping it. ${ASK_FIRST}`,
      ),
  )

  server.registerPrompt(
    'weekly-review',
    {
      title: 'Weekly review',
      description: 'Done this week, overdue, the week ahead, and active tasks that have not moved in a long time.',
    },
    () =>
      userMessage(
        'Do my weekly review in NexTask. Use `search_tasks` with `archivedWithinDays: 7` to list what I finished ' +
          'this week, `agenda` for overdue tasks and the next 7 days, and `search_tasks` with ' +
          '`notUpdatedForDays: 30` to find forgotten active tasks. Give me a short recap: done, slipping, coming up, ' +
          `forgotten. Then propose what to archive, reschedule or split. ${ASK_FIRST}`,
      ),
  )

  server.registerPrompt(
    'process-inbox',
    {
      title: 'Process inbox',
      description: 'Sort the tasks of the first column of a board: tags, column, date, checklist.',
      argsSchema: z.object({ board: z.string().describe('Board name') }),
    },
    ({ board }) =>
      userMessage(
        `Process the inbox of my NexTask board "${board}": call \`overview\` to find its first column, then ` +
          '`search_tasks` on that column and `get_task` where needed. For each task, propose a clearer title if ' +
          'useful, tags (reuse existing ones), a target column, a date if one is implied, and a checklist if the ' +
          `task hides several steps. ${ASK_FIRST}`,
      ),
  )
}
