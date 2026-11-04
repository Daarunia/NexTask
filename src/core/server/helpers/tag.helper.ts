import type { Prisma, Tag } from '../../prisma/generated/prisma/client.js'
import { TAG_COLORS, type TagColor } from '../../shared/tag.constants.js'
import Logger from 'electron-log'

/**
 * Helpers de rapprochement et de création des tags, partagés par les routes
 * des tâches et des tags.
 *
 * SQLite (via Prisma) ne sait pas comparer des chaînes sans tenir compte de la
 * casse : chaque tag porte donc sa clé `nameKey` (nom en minuscules), unique en
 * base. Toute écriture du nom doit passer par `tagKey` pour la tenir à jour.
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/**
 * Clé de comparaison d'un nom de tag (sans tenir compte de la casse).
 *
 * @param name Nom de tag, déjà nettoyé
 */
export function tagKey(name: string): string {
  return name.toLowerCase()
}

/**
 * Cherche un tag par son nom, sans tenir compte de la casse.
 *
 * @param tx Client Prisma (transaction ou client global)
 * @param name Nom recherché (nettoyé ici)
 * @returns Le tag trouvé, ou `null`
 */
export async function findTagByName(tx: TransactionClient, name: string): Promise<Tag | null> {
  return tx.tag.findUnique({ where: { nameKey: tagKey(name.trim()) } })
}

/**
 * Nombre de tags par couleur, compté en base.
 *
 * @param tx Client Prisma de la transaction
 */
async function countColors(tx: TransactionClient): Promise<Map<string, number>> {
  const groups = await tx.tag.groupBy({ by: ['color'], _count: { _all: true } })
  return new Map(groups.map((group) => [group.color, group._count._all]))
}

/**
 * Couleur de la palette la moins utilisée, la première dans l'ordre de
 * `TAG_COLORS` en cas d'égalité.
 *
 * @param usage Nombre de tags par couleur
 */
function leastUsedColor(usage: Map<string, number>): TagColor {
  let best: TagColor = TAG_COLORS[0]
  for (const color of TAG_COLORS) {
    if ((usage.get(color) ?? 0) < (usage.get(best) ?? 0)) {
      best = color
    }
  }
  return best
}

/**
 * Couleur à donner au prochain tag créé.
 *
 * @param tx Client Prisma de la transaction
 */
export async function nextTagColor(tx: TransactionClient): Promise<TagColor> {
  return leastUsedColor(await countColors(tx))
}

/**
 * Transforme une liste de noms de tags en ids, en créant les tags inconnus.
 *
 * 1. Nettoie les noms (trim) et les dédoublonne sans tenir compte de la casse
 *    (la première saisie l'emporte).
 * 2. Réutilise les tags existants, rapprochés par leur clé `nameKey`.
 * 3. Crée les autres avec la couleur la moins utilisée de la palette, en
 *    comptant les tags créés juste avant dans la même requête.
 *
 * À appeler dans une transaction, pour qu'aucun tag ne soit créé si
 * l'écriture de la tâche échoue ensuite.
 *
 * @param tx Client Prisma de la transaction
 * @param names Noms saisis
 * @returns Ids des tags, dans l'ordre des noms dédoublonnés
 */
export async function resolveTagIds(tx: TransactionClient, names: string[]): Promise<number[]> {
  // 1. Nettoyage et dédoublonnage
  const uniqueNames = new Map<string, string>()
  for (const raw of names) {
    const name = raw.trim()
    if (name && !uniqueNames.has(tagKey(name))) {
      uniqueNames.set(tagKey(name), name)
    }
  }

  if (!uniqueNames.size) return []

  // 2. Tags existants parmi les noms demandés
  const existingTags = await tx.tag.findMany({ where: { nameKey: { in: [...uniqueNames.keys()] } } })
  const tagsByKey = new Map(existingTags.map((tag) => [tag.nameKey, tag]))

  // 3. Rapprochement ou création (usage des couleurs lu seulement s'il faut créer)
  let colorUsage: Map<string, number> | null = null
  const ids: number[] = []
  for (const [key, name] of uniqueNames) {
    const existing = tagsByKey.get(key)
    if (existing) {
      ids.push(existing.id)
      continue
    }

    colorUsage ??= await countColors(tx)
    const color = leastUsedColor(colorUsage)
    const created = await tx.tag.create({ data: { name, nameKey: key, color } })
    colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
    ids.push(created.id)
    Logger.info(`Tag « ${name} » créé (couleur ${color})`)
  }

  return ids
}
