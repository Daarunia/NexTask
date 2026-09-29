import { defineStore } from 'pinia'
import { MINUTE } from '../constants/time.constants'
import { Tag } from '../types/tag.types'
import { BaseEntityState } from '../types/base-store.types'
import { api } from '../utils/api.helper'
import { isCacheValid } from '../utils/cache.helper'
import { useTaskStore } from './Task'
import { getLogger } from '../utils/logger'

/**
 * Compare deux tags par nom, dans l'ordre alphabétique sans tenir compte de la casse.
 */
function compareTagNames(a: Tag, b: Tag): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/**
 * Éditions de tags (création, renommage, couleur, suppression) envoyées au
 * serveur et pas encore terminées. Hors du state : rien à afficher, seulement
 * à attendre.
 */
const pendingEdits = new Set<Promise<unknown>>()

/**
 * Enregistre une édition en cours jusqu'à sa fin (réussie ou non)
 * @param edit Promesse de l'appel serveur
 * @returns La même promesse
 */
function trackEdit<T>(edit: Promise<T>): Promise<T> {
  pendingEdits.add(edit)
  edit.then(
    () => pendingEdits.delete(edit),
    () => pendingEdits.delete(edit),
  )
  return edit
}

/**
 * Cache des tags, source de vérité de leur affichage.
 *
 * Nom et couleur d'un tag s'affichent toujours via `getTagById`, jamais depuis
 * `task.tags` qui ne sert qu'à savoir quels ids porte une tâche : une édition
 * se reflète ainsi partout sans recharger les tâches.
 *
 * Même règle que les autres stores : le timestamp est celui du dernier
 * chargement serveur, les mutations ne le rafraîchissent pas.
 */
export const useTagStore = defineStore('tag', {
  state: (): BaseEntityState<Tag> => ({
    allEntities: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
  }),
  getters: {
    /**
     * Getter pour récupérer tous les tags triés par nom (sans contrôle du TTL, cf. getAllTasks)
     */
    getAllTags(state): Tag[] {
      return [...(state.allEntities?.data ?? [])].sort(compareTagNames)
    },

    /**
     * Getter pour récupérer un tag par son id (`undefined` s'il a été supprimé)
     */
    getTagById(state): (id: number) => Tag | undefined {
      return (id: number) => state.allEntities?.data.find((tag) => tag.id === id)
    },
  },
  actions: {
    setAllTagsCache(data: Tag[]) {
      this.allEntities = { data, timestamp: Date.now() }
    },

    /**
     * Chargement des tags et de leur nombre de tâches
     * @param force Recharge même si le cache est encore valide (ex : après
     *   l'enregistrement d'une tâche, pour récupérer les tags créés à la volée)
     */
    async loadAllTags(force = false): Promise<void> {
      if (!force && isCacheValid(this.allEntities, this.ttl)) return

      try {
        const tagsFromApi = await api.get<Tag[]>(`/tags`)
        this.setAllTagsCache(tagsFromApi)
      } catch (error) {
        getLogger().error('Erreur lors du chargement des tags :', error)
        throw error
      }
    },

    /**
     * Création d'un tag depuis le sélecteur (R7b). Si un tag porte déjà ce nom
     * (casse mise à part), le serveur le renvoie tel quel : il remplace alors
     * celui du cache au lieu d'être ajouté en double.
     * @param name Nom saisi (nettoyé par le serveur)
     * @returns Le tag créé ou existant
     */
    createTag(name: string): Promise<Tag> {
      // Suivie pour que l'enregistrement d'une tâche attende le tag créé
      return trackEdit(
        (async () => {
          try {
            const tag = await api.post<Tag>(`/tags`, { name })

            // Met à jour le cache local (timestamp 0 si aucun chargement : le cache reste à recharger)
            if (this.allEntities) {
              this.allEntities.data = [...this.allEntities.data.filter((t) => t.id !== tag.id), tag]
            } else {
              this.allEntities = { data: [tag], timestamp: 0 }
            }

            getLogger().debug('Tag créé', tag)
            return tag
          } catch (error) {
            getLogger().error(`Erreur lors de la création du tag « ${name} » :`, error)
            throw error
          }
        })(),
      )
    },

    /**
     * Renomme et/ou recolore un tag, puis répercute l'édition sur les tâches du cache
     * @param id Id du tag
     * @param changes Nouveau nom et/ou nouvelle couleur
     * @returns Le tag mis à jour
     */
    updateTag(id: number, changes: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag> {
      // Suivie pour que l'enregistrement d'une tâche puisse attendre le nouveau nom
      return trackEdit(
        (async () => {
          try {
            const updatedTag = await api.patch<Tag>(`/tags/${id}`, changes)

            // Met à jour le cache local
            const tagToUpdate = this.allEntities?.data.find((t) => t.id === id)
            if (tagToUpdate) {
              Object.assign(tagToUpdate, updatedTag)
            } else {
              getLogger().warn("Tag non trouvé dans le cache pour l'ID", id)
            }

            useTaskStore().patchTagInTasks(updatedTag)

            return updatedTag
          } catch (error) {
            getLogger().error(`Erreur lors de la mise à jour du tag ${id} :`, error)
            throw error
          }
        })(),
      )
    },

    /**
     * Suppression d'un tag, retiré aussi des tâches du cache
     * (le serveur le retire des tâches en base, actives comme historisées)
     * @param id Id du tag
     */
    deleteTag(id: number): Promise<void> {
      const logger = getLogger()

      // Suivie pour que l'enregistrement d'une tâche puisse écarter le tag supprimé
      return trackEdit(
        (async () => {
          try {
            await api.delete(`/tags/${id}`)

            if (this.allEntities) {
              this.allEntities.data = this.allEntities.data.filter((t) => t.id !== id)
            }

            useTaskStore().removeTagFromTasks(id)
            logger.debug(`Tag ${id} supprimé`)
          } catch (error) {
            logger.error(`Erreur lors de la suppression du tag ${id} :`, error)
            throw error
          }
        })(),
      )
    },

    /**
     * Attend la fin des éditions de tags en cours, réussies ou non (ne lève jamais).
     * À appeler avant de convertir les tags d'une tâche en noms, car un renommage
     * encore en vol ferait renvoyer l'ancien nom, que le serveur recréerait, et
     * une création encore en vol ne serait pas encore dans le cache.
     */
    async waitForPendingEdits(): Promise<void> {
      // Boucle, une édition pouvant démarrer pendant l'attente des précédentes
      while (pendingEdits.size) {
        await Promise.allSettled(pendingEdits)
      }
    },
  },
})
