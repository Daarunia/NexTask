import type { Checklist, Prisma } from '../../prisma/generated/prisma/client.js'
import { tagKey } from './tag.helper.js'

/**
 * Helpers des checklists, partagés par les routes des modèles et des tâches.
 *
 * Une `Checklist` sans `taskId` est un modèle. Prisma ne sait pas exprimer
 * l'invariant « `taskId` null si et seulement si `name`, `nameKey` et
 * `position` sont renseignés », c'est donc au code de le tenir. Toute requête
 * de modèle filtre `taskId: null`, et toute création de modèle écrit les trois
 * champs.
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/** Point de modèle prêt à écrire, jamais coché. */
export interface TemplateItemRow {
  text: string
  position: number
  isChecked: false
  checkedAt: null
}

/**
 * Clé de comparaison d'un nom de modèle, sans tenir compte de la casse. Même
 * normalisation que les tags, dont la fonction est reprise telle quelle.
 *
 * @param name Nom de modèle, déjà nettoyé
 */
export const templateKey: (name: string) => string = tagKey

/** Points renvoyés avec chaque modèle, dans l'ordre. */
export const templateInclude = {
  items: { orderBy: { position: 'asc' } },
} as const

/** Filtre des modèles, qui écarte les checklists des tâches. */
export const templateWhere = { taskId: null } as const

/**
 * Cherche un modèle par son nom, sans tenir compte de la casse. Les
 * checklists des tâches, sans nom, ne sont jamais trouvées.
 *
 * @param tx Client Prisma (transaction ou client global)
 * @param name Nom recherché (nettoyé ici)
 * @returns Le modèle trouvé, ou `null`
 */
export async function findTemplateByName(tx: TransactionClient, name: string): Promise<Checklist | null> {
  return tx.checklist.findFirst({ where: { ...templateWhere, nameKey: templateKey(name.trim()) } })
}

/**
 * Position d'un modèle ajouté en fin de liste (0 s'il n'y en a aucun).
 *
 * @param tx Client Prisma de la transaction en cours
 */
export async function nextTemplatePosition(tx: TransactionClient): Promise<number> {
  const { _max } = await tx.checklist.aggregate({ where: templateWhere, _max: { position: true } })
  return _max.position === null ? 0 : _max.position + 1
}

/**
 * Points d'un modèle à écrire, à partir des textes saisis. Les textes sont
 * nettoyés (trim), les vides retirés, la position est le rang dans la liste
 * restante et aucun point n'est coché.
 *
 * @param texts Textes des points, dans l'ordre
 */
export function templateItemRows(texts: string[]): TemplateItemRow[] {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .map((text, position) => ({ text, position, isChecked: false, checkedAt: null }))
}
