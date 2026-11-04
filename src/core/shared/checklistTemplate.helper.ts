import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } from './checklist.constants.js'

/**
 * Règles de nommage des modèles de checklist, partagées entre le main
 * (duplication côté serveur) et le renderer (« Nouveau modèle » de la page
 * Checklists, contrôle du nom saisi).
 *
 * Fonctions pures, fichier sans import Node (cf. settings.constants.ts).
 */

/**
 * Clé de comparaison d'un nom de modèle, sans tenir compte de la casse. Même
 * normalisation que les tags (cf. tagKey), c'est elle qu'écrit le serveur
 * dans `nameKey`.
 *
 * @param name Nom de modèle, déjà nettoyé
 */
export function templateKey(name: string): string {
  return name.toLowerCase()
}

/**
 * Premier nom libre à partir de `base`, sans tenir compte de la casse. La base
 * elle-même si elle est libre, sinon « base 2 », « base 3 »… La base est
 * raccourcie si besoin pour que le numéro tienne dans la longueur maximale.
 *
 * @param base Nom souhaité, déjà nettoyé (ex. « Revue de code (copie) »)
 * @param takenKeys Clés (`templateKey`) des noms déjà pris
 * @param maxLength Longueur maximale du nom
 */
export function duplicateName(
  base: string,
  takenKeys: ReadonlySet<string>,
  maxLength = CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
): string {
  // Termine toujours, l'ensemble des noms pris étant fini
  for (let rank = 1; ; rank++) {
    const suffix = rank === 1 ? '' : ` ${rank}`
    const candidate = base.slice(0, maxLength - suffix.length).trimEnd() + suffix
    if (!takenKeys.has(templateKey(candidate))) return candidate
  }
}
