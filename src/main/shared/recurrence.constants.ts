/**
 * Tâches récurrentes, partagées entre le main, le renderer et les tests.
 * Fichier sans import, cf. settings.constants.ts.
 */

/** Fréquences d'une série. */
export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const

/** Fréquence d'une série. */
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/**
 * Modes du mensuel : jour fixe du mois, « 3e jeudi », dernier jour du mois.
 * Seul `dayOfMonth` est proposé pour l'instant (cf. SUPPORTED_MONTHLY_MODES).
 */
export const MONTHLY_MODES = ['dayOfMonth', 'nthWeekday', 'lastDay'] as const

/** Mode du mensuel. */
export type MonthlyMode = (typeof MONTHLY_MODES)[number]

/** Modes du mensuel acceptés par l'API. */
export const SUPPORTED_MONTHLY_MODES = ['dayOfMonth'] as const

/** Fins possibles d'une série : jamais, à une date (incluse), après N occurrences. */
export const RECURRENCE_END_TYPES = ['never', 'onDate', 'afterCount'] as const

/** Fin d'une série. */
export type RecurrenceEndType = (typeof RECURRENCE_END_TYPES)[number]

/** États d'une série : seules les séries actives génèrent des occurrences. */
export const RECURRENCE_STATUSES = ['active', 'paused', 'ended'] as const

/** État d'une série. */
export type RecurrenceStatus = (typeof RECURRENCE_STATUSES)[number]

/** Intervalle maximal (« tous les 99 jours »). */
export const RECURRENCE_INTERVAL_MAX = 99

/** Nombre maximal d'occurrences d'une série qui se termine « après N occurrences ». */
export const RECURRENCE_COUNT_MAX = 999

/**
 * Règle saisie dans le formulaire de tâche, envoyée à l'API (POST et PATCH
 * /tasks). L'heure et le début de la série sont tirés de la date de début de
 * la tâche, par le serveur.
 */
export interface RecurrenceInput {
  frequency: RecurrenceFrequency
  interval: number // 1 à RECURRENCE_INTERVAL_MAX
  weekdays?: number[] // jours ISO (lundi = 1), au moins un en hebdomadaire
  monthlyMode?: MonthlyMode | null // `dayOfMonth` seulement, mensuel uniquement
  endType: RecurrenceEndType
  endsOn?: string | null // date de fin (ISO), incluse jusqu'à la fin de sa journée locale
  maxCount?: number | null // nombre total d'occurrences, tâche d'origine comprise
  skipIfPending: boolean // « Ne pas empiler » : date sautée si une occurrence est encore active
}

/**
 * Résumé d'une série, renvoyé avec chaque tâche qui en est une occurrence
 * (sans le modèle des occurrences). Dates en chaînes ISO, telles que reçues
 * par HTTP.
 */
export interface RecurrenceSummary {
  id: number
  frequency: RecurrenceFrequency
  interval: number
  weekdays: string | null // jours ISO séparés par des virgules ("1,4")
  monthlyMode: MonthlyMode | null
  time: string // heure locale "HH:mm"
  startsAt: string
  endType: RecurrenceEndType
  endsOn: string | null
  maxCount: number | null
  generatedCount: number
  skipIfPending: boolean
  status: RecurrenceStatus
  nextRunAt: string | null // null une fois la série terminée
}
