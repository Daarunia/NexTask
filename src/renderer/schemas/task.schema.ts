import { z } from 'zod'

/** Longueur maximale d'un titre de tâche (alignée sur la validation de l'API). */
export const TASK_TITLE_MAX_LENGTH = 255

/** Longueur maximale d'un nom de tag (alignée sur la validation de l'API). */
export const TAG_NAME_MAX_LENGTH = 30

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
  tags: tagSelectionsSchema,
})

/** Valeurs du formulaire de tâche, une fois validées. */
export type TaskFormValues = z.infer<typeof taskFormSchema>
