<template>
  <!-- L'entrée du tableau et son chevron forment un seul bloc : même fond, même survol -->
  <div :class="['board-view-entry', { 'is-active': route.name === 'Home' }]" data-testid="board-view-entry">
    <slot />
    <button
      type="button"
      class="board-view-toggle"
      data-testid="btn-board-view-menu"
      :aria-label="t('nav.viewMenu')"
      :aria-expanded="expanded"
      aria-controls="board-view-menu"
      v-tooltip.right="infoTooltip(t('nav.viewMenu'))"
      @click="expanded = !expanded"
    >
      <i :class="['pi', expanded ? 'pi-chevron-up' : 'pi-chevron-down']" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Sous-menu déplié dans le rail, qui pousse les entrées suivantes. Un fieldset
       nomme le groupe de boutons sans rôle ARIA ajouté -->
  <fieldset
    v-if="expanded"
    id="board-view-menu"
    class="board-view-menu"
    data-testid="board-view-menu"
    :aria-label="t('nav.viewMenu')"
  >
    <button
      v-for="item in items"
      :key="item.view"
      type="button"
      :class="['board-view-item', { 'is-current': item.current }]"
      :data-testid="`btn-view-${item.view}`"
      :aria-label="item.label"
      :aria-current="item.current ? 'true' : undefined"
      v-tooltip.right="infoTooltip(item.label)"
      @click="chooseView(item.view)"
    >
      <i :class="['pi', item.icon]" aria-hidden="true"></i>
    </button>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { BOARD_VIEWS, type BoardView } from '@core/shared/settings.constants'
import { BOARD_VIEW_ICONS } from '../constants/boardView.constants'
import { useSettingsStore } from '../stores/Settings'
import { useErrorToast } from '../utils/toast.helper'
import { infoTooltip } from '../utils/tooltip.helper'

/**
 * Entrée du tableau dans le rail (reçue en slot) et sous-menu des modes
 * d'affichage des tâches : le chevron le déplie sur place. Choisir un mode ouvre
 * la page du tableau, depuis n'importe quelle page.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const showError = useErrorToast()

const expanded = ref(false)

// Calculé pour suivre la langue de l'interface et le mode en cours
const items = computed(() =>
  BOARD_VIEWS.map((view) => ({
    view,
    label: t(`nav.${view}`),
    icon: BOARD_VIEW_ICONS[view],
    current: route.name === 'Home' && view === settings.boardView,
  })),
)

/**
 * Ouvre un mode, choisi avant la navigation pour ne pas afficher l'autre entre-temps.
 * Un échec de l'enregistrement le rétablit et prévient.
 * @param view Mode choisi
 */
function chooseView(view: BoardView) {
  if (view !== settings.boardView) {
    settings.set('boardView', view).catch(() => showError(t('planning.viewNotSaved')))
  }
  router.push({ name: 'Home' })
}
</script>

<style scoped>
@reference "tailwindcss";

.board-view-entry {
  @apply relative flex w-10 flex-col rounded-lg;
  color: var(--p-text-muted-color);
}

.board-view-entry:hover {
  background-color: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.board-view-entry.is-active {
  background-color: var(--p-highlight-background);
  color: var(--p-primary-color);
}

/* Barre d'accent collée au bord gauche du rail, sur la hauteur du bloc */
.board-view-entry.is-active::before {
  @apply absolute -left-2 top-3 bottom-3 w-[3px];
  content: '';
  border-radius: 0 3px 3px 0;
  background-color: var(--p-primary-color);
}

.board-view-toggle {
  @apply grid h-4 w-10 cursor-pointer place-items-center rounded-b-lg;
  background: none;
  border: none;
  color: inherit;
}

.board-view-toggle .pi {
  font-size: 0.625rem;
}

/* Sans le cadre, la marge ni le retrait par défaut d'un fieldset */
.board-view-menu {
  @apply m-0 flex w-10 min-w-0 flex-col items-center gap-0.5 rounded-lg border-0 px-0 py-0.5;
  background-color: var(--p-content-hover-background);
}

.board-view-item {
  @apply grid size-8 cursor-pointer place-items-center rounded-md;
  background: none;
  border: none;
  color: var(--p-text-muted-color);
}

.board-view-item .pi {
  font-size: 1rem;
}

.board-view-item:hover {
  color: var(--p-text-color);
}

.board-view-item.is-current {
  background-color: var(--p-highlight-background);
  color: var(--p-primary-color);
}

.board-view-toggle:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.board-view-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}
</style>
