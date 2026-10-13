<template>
  <nav class="app-rail select-none" :aria-label="t('nav.label')" data-testid="app-rail">
    <template v-for="entry in entries" :key="entry.route">
      <!-- Les entrées du bas (Paramètres) sont poussées en bas du rail -->
      <span v-if="entry.bottom" class="rail-spacer" />

      <RouterLink v-slot="{ href, navigate }" :to="{ name: entry.route }" custom>
        <a
          :href="href"
          class="rail-link"
          :class="{ 'is-active': isActive(entry) }"
          :aria-label="entry.label"
          :aria-current="isActive(entry) ? 'page' : undefined"
          :data-testid="entry.testid"
          v-tooltip.right="infoTooltip(entry.label)"
          @click="navigate"
        >
          <i :class="['pi', entry.icon]" aria-hidden="true" />
        </a>
      </RouterLink>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { infoTooltip } from '../utils/tooltip.helper'

/** Entrée du rail, liée à une route nommée. */
interface RailEntry {
  /** Nom de la route ouverte par l'entrée */
  route: string
  /** Icône PrimeIcons (ex : `pi-cog`) */
  icon: string
  /** Libellé traduit, pour l'infobulle et l'`aria-label` */
  label: string
  /** Identifiant de test */
  testid?: string
  /** Entrée placée en bas du rail */
  bottom?: boolean
}

const { t } = useI18n()
const route = useRoute()

// Ordre d'affichage, une nouvelle page s'ajoute ici avec sa route (libellés recalculés au changement de langue)
const entries = computed<RailEntry[]>(() => [
  { route: 'Home', icon: 'pi-th-large', label: t('nav.board') },
  { route: 'Archives', icon: 'pi-box', label: t('nav.archives'), testid: 'btn-archives' },
  { route: 'Settings', icon: 'pi-cog', label: t('nav.settings'), bottom: true },
])

/**
 * Entrée de la page courante, marquée à l'accent.
 * Comparaison sur le nom de route, pour rester active quels que soient les paramètres de l'URL.
 * @param entry Entrée du rail
 */
function isActive(entry: RailEntry): boolean {
  return route.name === entry.route
}
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

.rail-link {
  @apply relative grid size-10 place-items-center rounded-lg;
  color: var(--p-text-muted-color);
}

.rail-link .pi {
  font-size: 1.25rem;
}

.rail-link:hover {
  background-color: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.rail-link:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.rail-link.is-active {
  background-color: var(--p-highlight-background);
  color: var(--p-primary-color);
}

/* Barre d'accent collée au bord gauche du rail */
.rail-link.is-active::before {
  @apply absolute -left-2 top-2.5 bottom-2.5 w-[3px];
  content: '';
  border-radius: 0 3px 3px 0;
  background-color: var(--p-primary-color);
}
</style>
