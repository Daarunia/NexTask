import { z } from 'zod'

/** Longueur maximale d'un titre de tâche (alignée sur la validation de l'API). */
export const TASK_TITLE_MAX_LENGTH = 255

/** Longueur maximale d'un nom de tag (alignée sur la validation de l'API). */
export const TAG_NAME_MAX_LENGTH = 30

/**
 * Tag choisi dans le formulaire (cf. TagSelection) : sans `id`, tag à créer.
 * Le nom est nettoyé (trim) puis contrôlé comme côté API.
 */
const tagSelectionSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du tag est obligatoire')
    .max(TAG_NAME_MAX_LENGTH, `${TAG_NAME_MAX_LENGTH} caractères maximum par tag`),
})

/**
 * Règles de validation du formulaire de tâche (TaskDialog).
 *
 * Le titre est nettoyé (trim) avant contrôle, donc un titre composé uniquement
 * d'espaces est refusé, et la valeur enregistrée est la version nettoyée.
 */
export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre est obligatoire')
    .max(TASK_TITLE_MAX_LENGTH, `${TASK_TITLE_MAX_LENGTH} caractères maximum`),
  description: z.string(),
  version: z.string({ error: 'Sélectionne une version' }).min(1, 'Sélectionne une version'),
  startDate: z.date().nullable(),
  tags: z.array(tagSelectionSchema),
})

/** Valeurs du formulaire de tâche, une fois validées. */
export type TaskFormValues = z.infer<typeof taskFormSchema>
