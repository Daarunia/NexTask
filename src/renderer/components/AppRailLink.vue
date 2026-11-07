<template>
  <RouterLink v-slot="{ href, navigate }" :to="{ name: routeName }" custom>
    <a
      :href="href"
      :class="['rail-link', { 'is-active': isActive, grouped }]"
      :aria-label="label"
      :aria-current="isActive ? 'page' : undefined"
      :data-testid="testid"
      v-tooltip.right="infoTooltip(label)"
      @click="navigate"
    >
      <i :class="['pi', icon]" aria-hidden="true" />
    </a>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { infoTooltip } from '../utils/tooltip.helper'

/**
 * Entrée du rail, liée à une route nommée. Marquée à l'accent sur sa page :
 * comparaison sur le nom de route, pour rester active quels que soient les
 * paramètres de l'URL. `grouped` laisse le fond, les arrondis et la couleur au
 * bloc qui la contient (cf. BoardViewMenu).
 */
const props = withDefaults(
  defineProps<{
    routeName: string // nom de la route ouverte par l'entrée
    icon: string // icône PrimeIcons, par exemple `pi-cog`
    label: string // libellé traduit, pour l'infobulle et l'`aria-label`
    testid: string // identifiant de test
    grouped?: boolean
  }>(),
  { grouped: false },
)

const route = useRoute()
const isActive = computed(() => route.name === props.routeName)
</script>

<style scoped>
@reference "tailwindcss";

.rail-link {
  @apply relative grid size-10 place-items-center;
}

.rail-link .pi {
  font-size: 1.25rem;
}

.rail-link:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.rail-link.grouped:focus-visible {
  outline-offset: -2px;
}

.rail-link.grouped {
  color: inherit;
}

.rail-link:not(.grouped) {
  @apply rounded-lg;
  color: var(--p-text-muted-color);
}

.rail-link:not(.grouped):hover {
  background-color: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.rail-link:not(.grouped).is-active {
  background-color: var(--p-highlight-background);
  color: var(--p-primary-color);
}

/* Barre d'accent collée au bord gauche du rail */
.rail-link:not(.grouped).is-active::before {
  @apply absolute -left-2 top-2.5 bottom-2.5 w-[3px];
  content: '';
  border-radius: 0 3px 3px 0;
  background-color: var(--p-primary-color);
}
</style>
