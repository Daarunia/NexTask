import type { RecurrenceListItem, RecurrenceSummary } from '../../shared/recurrence.constants.js'

/**
 * Réponses de l'API lues par les outils MCP, telles que les routes les
 * sérialisent (dates en chaînes ISO). Seuls les champs utilisés sont déclarés.
 */

export interface ApiTag {
  id: number
  name: string
  color: string
  taskCount?: number
}

export interface ApiChecklistItem {
  id: number
  text: string
  isChecked: boolean
}

export interface ApiDocument {
  id: number
  name: string
  size: number
  createdAt: string
}

export interface ApiTask {
  id: number
  title: string
  description: string
  version: string
  position: number
  isHistorized: boolean
  historizationDate: string | null
  stageId: number | null
  boardId: number | null
  startDate: string | null
  createdAt: string
  updatedAt: string
  tags?: ApiTag[]
  recurrenceId: number | null
  recurrence?: RecurrenceSummary | null
  checklist?: { items: ApiChecklistItem[] } | null
  documents?: ApiDocument[]
}

export interface ApiStage {
  id: number
  name: string
  position: number
  color: string | null
  boardId: number
  tasks?: ApiTask[]
}

export interface ApiBoard {
  id: number
  name: string
  color: string | null
  position: number
}

export interface ApiChecklistTemplate {
  id: number
  name: string
}

export type ApiRecurrence = RecurrenceListItem
