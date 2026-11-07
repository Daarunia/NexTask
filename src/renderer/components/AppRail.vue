<template>
  <nav class="app-rail select-none" :aria-label="t('nav.label')" data-testid="app-rail">
    <template v-for="entry in entries" :key="entry.testid">
      <!-- Les entrées du bas (Paramètres) sont poussées en bas du rail -->
      <span v-if="entry.bottom" class="rail-spacer" />

      <!-- Le tableau a plusieurs modes d'affichage, choisis dans ce sous-menu -->
      <BoardViewMenu v-if="entry.route === 'Home'">
        <AppRailLink :routeName="entry.route" :icon="entry.icon" :label="entry.label" :testid="entry.testid" grouped />
      </BoardViewMenu>
      <AppRailLink v-else :routeName="entry.route" :icon="entry.icon" :label="entry.label" :testid="entry.testid" />
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppRailLink from './AppRailLink.vue'
import BoardViewMenu from './BoardViewMenu.vue'
import { BOARD_VIEW_ICONS } from '../constants/boardView.constants'
import { useSettingsStore } from '../stores/Settings'

/** Entrée du rail, liée à une route nommée. */
interface RailEntry {
  /** Nom de la route ouverte par l'entrée */
  route: string
  /** Icône PrimeIcons, par exemple `pi-cog` */
  icon: string
  /** Libellé traduit, pour l'infobulle et l'`aria-label` */
  label: string
  /** Identifiant de test */
  testid: string
  /** Entrée placée en bas du rail */
  bottom?: boolean
}

const { t } = useI18n()
const settings = useSettingsStore()

// Ordre d'affichage, une nouvelle page s'ajoute ici avec sa route (libellés recalculés au changement de langue)
const entries = computed<RailEntry[]>(() => [
  // Le tableau, dans son mode d'affichage en cours (cf. BoardViewMenu)
  {
    route: 'Home',
    icon: BOARD_VIEW_ICONS[settings.boardView],
    label: t(`nav.${settings.boardView}`),
    testid: 'btn-home',
  },
  { route: 'Checklists', icon: 'pi-list-check', label: t('nav.checklists'), testid: 'btn-checklists' },
  { route: 'Archives', icon: 'pi-box', label: t('nav.archives'), testid: 'btn-archives' },
  { route: 'Settings', icon: 'pi-cog', label: t('nav.settings'), testid: 'btn-settings', bottom: true },
])
</script>

<style scoped>
@reference "tailwindcss";

.app-rail {
  @apply flex w-14 shrink-0 flex-col items-center gap-1 py-2.5;
  background-color: var(--p-surface-50);
  border-right: 1px solid var(--p-content-border-color);
}

.app-dark .app-rail {
  background-color: var(--p-surface-900);
}

.rail-spacer {
  @apply flex-1;
}
</style>
