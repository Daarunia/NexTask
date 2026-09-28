import { z } from 'zod'

/** Longueur maximale d'un titre de tâche (alignée sur la validation de l'API). */
export const TASK_TITLE_MAX_LENGTH = 255

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
})

/** Valeurs du formulaire de tâche, une fois validées. */
export type TaskFormValues = z.infer<typeof taskFormSchema>
