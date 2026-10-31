/**
 * Règles de nommage des tableaux, partagées entre le main (unicité du nom
 * côté serveur) et le renderer (contrôle du nom saisi).
 *
 * Fonctions pures, fichier sans import Node (cf. settings.constants.ts).
 */

/**
 * Clé de comparaison d'un nom de tableau, sans tenir compte de la casse. Même
 * normalisation que les tags et les modèles de checklist (cf. tagKey et
 * templateKey), c'est elle qu'écrit le serveur dans `nameKey`.
 *
 * @param name Nom de tableau, déjà nettoyé
 */
export function boardKey(name: string): string {
  return name.toLowerCase()
}
