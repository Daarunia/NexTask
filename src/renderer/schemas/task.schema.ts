import { z } from 'zod'
import { LABEL_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../../main/shared/validation.constants'
import {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_END_TYPES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_INTERVAL_MAX,
} from '../../main/shared/recurrence.constants'

/**
 * Choix du champ « Répéter » : ne pas répéter, un préréglage calculé depuis
 * la date de début, ou une règle personnalisée.
 */
export const RECURRENCE_PRESETS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'] as const

/** Choix du champ « Répéter ». */
export type RecurrencePreset = (typeof RECURRENCE_PRESETS)[number]

/**
 * Valeur du champ « Répéter » (cf. RecurrenceFields). Les champs de la règle
 * personnalisée sont gardés quel que soit le choix, mais ne sont lus et
 * contrôlés qu'avec « Personnaliser… ».
 */
const recurrenceFieldsSchema = z.object({
  preset: z.enum(RECURRENCE_PRESETS),
  interval: z.number().nullable(), // vide pendant la saisie
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  weekdays: z.array(z.number()), // jours ISO (lundi = 1)
  endType: z.enum(RECURRENCE_END_TYPES),
  endsOn: z.date().nullable(),
  maxCount: z.number().nullable(),
  skipIfPending: z.boolean(),
})

/** Valeur du champ « Répéter ». */
export type RecurrenceFormValue = z.infer<typeof recurrenceFieldsSchema>

/**
 * Début de la journée locale d'une date (comparaison de jours).
 * @param date Date
 */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Contrôles de la répétition, qui croisent plusieurs champs : date de début
 * obligatoire, puis pour une règle personnalisée intervalle, jours de la
 * semaine et fin. Les erreurs de la règle sont rattachées au champ
 * `recurrence`, celle de la date au champ `startDate`.
 * @param values Valeurs du formulaire
 * @param ctx Contexte zod
 */
function checkRecurrence(values: { startDate: Date | null; recurrence: RecurrenceFormValue }, ctx: z.RefinementCtx) {
  const { recurrence, startDate } = values
  if (recurrence.preset === 'none') return

  if (!startDate) {
    ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Une tâche récurrente doit avoir une date de début' })
  }

  if (recurrence.preset !== 'custom') return

  const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['recurrence'], message })
  const { interval, maxCount } = recurrence

  if (interval === null || !Number.isInteger(interval) || interval < 1 || interval > RECURRENCE_INTERVAL_MAX) {
    issue(`L'intervalle doit être compris entre 1 et ${RECURRENCE_INTERVAL_MAX}`)
  } else if (recurrence.frequency === 'weekly' && !recurrence.weekdays.length) {
    issue('Choisis au moins un jour de la semaine')
  } else if (recurrence.endType === 'onDate' && !recurrence.endsOn) {
    issue('Choisis la date de fin de la série')
  } else if (recurrence.endType === 'onDate' && startDate && startOfDay(recurrence.endsOn!) < startOfDay(startDate)) {
    issue('La date de fin doit suivre la date de début')
  } else if (
    recurrence.endType === 'afterCount' &&
    (maxCount === null || !Number.isInteger(maxCount) || maxCount < 1 || maxCount > RECURRENCE_COUNT_MAX)
  ) {
    issue(`Le nombre d'occurrences doit être compris entre 1 et ${RECURRENCE_COUNT_MAX}`)
  }
}

/**
 * Tags choisis dans le formulaire (cf. TagSelection). Le sélecteur crée les
 * tags immédiatement, chaque tag a donc un `id` (sans `id`, tag à créer).
 * Chaque nom est nettoyé (trim) puis doit faire de 1 à 30 caractères, comme
 * côté API. Le contrôle porte sur le tableau entier pour que l'erreur soit
 * rattachée au champ `tags` (une erreur par élément serait rangée sous
 * `tags.0.name`, que le formulaire n'associe à aucun champ).
 */
const tagSelectionsSchema = z
  .array(
    z.object({
      id: z.number().optional(),
      name: z.string().trim(),
    }),
  )
  .refine(
    (tags) => tags.every((tag) => tag.name.length >= 1 && tag.name.length <= TAG_NAME_MAX_LENGTH),
    `Un tag doit faire entre 1 et ${TAG_NAME_MAX_LENGTH} caractères`,
  )

/**
 * Règles de validation du formulaire de tâche (TaskDialog).
 *
 * Le titre est nettoyé (trim) avant contrôle, donc un titre composé uniquement
 * d'espaces est refusé, et la valeur enregistrée est la version nettoyée.
 * Une tâche répétée doit avoir une date de début (cf. checkRecurrence).
 */
export const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Le titre est obligatoire')
      .max(LABEL_MAX_LENGTH, `${LABEL_MAX_LENGTH} caractères maximum`),
    description: z.string(),
    version: z.string({ error: 'Sélectionne une version' }).min(1, 'Sélectionne une version'),
    startDate: z.date().nullable(),
    tags: tagSelectionsSchema,
    recurrence: recurrenceFieldsSchema,
    // « Appliquer aux prochaines occurrences » (modification d'une occurrence)
    applyToSeries: z.boolean().default(true),
  })
  .superRefine(checkRecurrence)

/** Valeurs du formulaire de tâche, une fois validées. */
export type TaskFormValues = z.infer<typeof taskFormSchema>
