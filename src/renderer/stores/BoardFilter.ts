import { defineStore } from 'pinia'
import type { Task } from '../types/task.types'
import { useSettingsStore } from './Settings'
import { useTagStore } from './Tag'
import { searchTerms, taskMatchesFilter } from '../utils/search.helper'
import { getLogger } from '../utils/logger'

/**
 * Filtre du board, partagé entre la barre de recherche (en-tête) et le
 * Kanban : texte libre (titre et description) et tags sélectionnés (OU),
 * combinés en ET.
 *
 * Seuls les tags sont mémorisés (paramètre « mémoriser le filtre de tags »),
 * le texte est vidé au redémarrage. Les actions qui changent les tags sont
 * rejetées si cet enregistrement échoue : le filtre reste appliqué, à
 * l'appelant de prévenir l'utilisateur.
 */
export const useBoardFilterStore = defineStore('boardFilter', {
  state: () => ({
    query: '',
    tagIds: [] as number[],
  }),

  getters: {
    // Mots recherchés, normalisés
    terms: (state) => searchTerms(state.query),
    isActive(): boolean {
      return this.terms.length > 0 || this.tagIds.length > 0
    },
  },

  actions: {
    /**
     * Vrai si la tâche passe le filtre courant.
     * @param task Tâche à tester
     */
    matches(task: Task): boolean {
      return taskMatchesFilter(task, this.terms, this.tagIds)
    },

    /**
     * Ajoute un tag au filtre (sans doublon).
     * @param tagId Id du tag
     */
    async addTag(tagId: number) {
      if (!this.tagIds.includes(tagId)) await this.setTags([...this.tagIds, tagId])
    },

    /**
     * Retire un tag du filtre.
     * @param tagId Id du tag
     */
    async removeTag(tagId: number) {
      await this.setTags(this.tagIds.filter((id) => id !== tagId))
    },

    /**
     * Remplace les tags du filtre et les mémorise si le paramètre est activé.
     * @param tagIds Nouveaux ids
     */
    async setTags(tagIds: number[]) {
      this.tagIds = tagIds
      await this.persistTags()
    },

    /**
     * Vide le texte et les tags.
     */
    async clear() {
      this.query = ''
      await this.setTags([])
    },

    /**
     * Retire du filtre les tags supprimés. Un tag qui n'est simplement plus
     * porté reste sélectionné.
     */
    async pruneDeletedTags() {
      const tagStore = useTagStore()
      const existing = this.tagIds.filter((id) => tagStore.getTagById(id) !== undefined)
      if (existing.length === this.tagIds.length) return

      getLogger().debug('Tags supprimés retirés du filtre', { tagIds: this.tagIds, existing })
      await this.setTags(existing)
    },

    /**
     * Reprend les tags mémorisés si le paramètre est activé, sans les tags
     * supprimés depuis (ils sortent aussi du filtre enregistré).
     */
    async restoreTags() {
      const settings = useSettingsStore()
      if (!settings.rememberTagFilter) return

      const tagStore = useTagStore()
      this.tagIds = settings.tagFilterIds.filter((id) => tagStore.getTagById(id) !== undefined)
      getLogger().debug('Filtre de tags mémorisé repris', this.tagIds)
      await this.persistTags()
    },

    /**
     * Enregistre les tags du filtre si le paramètre est activé et qu'ils ont changé.
     */
    async persistTags() {
      const settings = useSettingsStore()
      const saved = settings.tagFilterIds
      const same = saved.length === this.tagIds.length && saved.every((id, index) => id === this.tagIds[index])
      if (!settings.rememberTagFilter || same) return

      await settings.set('tagFilterIds', [...this.tagIds])
    },
  },
})
