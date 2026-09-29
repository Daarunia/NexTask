import type { Prisma, Tag } from '../../prisma/generated/prisma/client.js'
import { TAG_COLORS, type TagColor } from '../../constants.js'
import Logger from 'electron-log'

/**
 * Helpers de rapprochement des tags, partagés par les routes des tâches et des
 * tags.
 *
 * SQLite (via Prisma) ne sait pas comparer des chaînes sans tenir compte de la
 * casse : l'unicité insensible à la casse des noms est donc garantie ici, en
 * comparant les noms mis en minuscules. Le `@unique` du modèle ne sert que de
 * garde-fou.
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/**
 * Clé de comparaison d'un nom de tag (sans tenir compte de la casse).
 *
 * @param name Nom de tag, déjà nettoyé
 */
function tagKey(name: string): string {
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
  const key = tagKey(name.trim())
  const tags = await tx.tag.findMany()
  return tags.find((tag) => tagKey(tag.name) === key) ?? null
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
 * Transforme une liste de noms de tags en ids, en créant les tags inconnus.
 *
 * 1. Nettoie les noms (trim) et les dédoublonne sans tenir compte de la casse
 *    (la première saisie l'emporte).
 * 2. Réutilise les tags existants, rapprochés sans tenir compte de la casse.
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

  // 2. Index des tags existants et usage des couleurs
  const existingTags = await tx.tag.findMany()
  const tagsByKey = new Map(existingTags.map((tag) => [tagKey(tag.name), tag]))
  const colorUsage = new Map<string, number>()
  for (const tag of existingTags) {
    colorUsage.set(tag.color, (colorUsage.get(tag.color) ?? 0) + 1)
  }

  // 3. Rapprochement ou création
  const ids: number[] = []
  for (const [key, name] of uniqueNames) {
    const existing = tagsByKey.get(key)
    if (existing) {
      ids.push(existing.id)
      continue
    }

    const color = leastUsedColor(colorUsage)
    const created = await tx.tag.create({ data: { name, color } })
    colorUsage.set(color, (colorUsage.get(color) ?? 0) + 1)
    ids.push(created.id)
    Logger.info(`Tag « ${name} » créé (couleur ${color})`)
  }

  return ids
}
