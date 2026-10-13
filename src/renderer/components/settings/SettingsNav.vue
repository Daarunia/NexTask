<template>
  <nav data-testid="settings-nav" :aria-label="t('settings.nav.label')" class="settings-nav">
    <ul class="flex flex-col gap-0.5">
      <li v-for="section in sections" :key="section.id">
        <button
          type="button"
          :data-testid="`settings-nav-${section.id}`"
          :class="['settings-nav-item', { active: section.id === activeId }]"
          :aria-current="section.id === activeId ? 'location' : undefined"
          @click="goTo(section.id)"
        >
          <i :class="['pi', section.icon]" aria-hidden="true" />
          <span class="truncate">{{ section.label }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Sommaire des Paramètres : un lien par section, qui fait défiler la page
 * jusqu'à elle, et la section affichée mise en avant au fil du défilement.
 */

export interface SettingsNavSection {
  // `id` de l'élément de la section dans la page
  id: string
  label: string
  // Classe PrimeIcons (ex. « pi-palette »)
  icon: string
}

const props = defineProps<{
  sections: SettingsNavSection[]
  // Conteneur qui défile et porte les sections
  container: HTMLElement | null
}>()

const { t } = useI18n()

const activeId = ref(props.sections[0]?.id ?? '')

// Section choisie dans le sommaire : elle reste active pendant le défilement
// qu'elle déclenche, même si elle ne peut pas atteindre le haut de la page
const clickedId = ref<string | null>(null)

// Marge sous le haut du conteneur : une section atteinte depuis le sommaire
// s'arrête à sa `scroll-margin-top`, juste en dessous
const ACTIVE_OFFSET = 48

/** Met en avant la dernière section dont le haut a atteint le haut du conteneur. */
function updateActive() {
  const container = props.container
  if (!container || clickedId.value) return

  // En bas de page, la dernière section ne peut plus monter : elle devient active
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
    activeId.value = props.sections.at(-1)?.id ?? activeId.value
    return
  }

  const limit = container.getBoundingClientRect().top + ACTIVE_OFFSET
  let current = props.sections[0]?.id ?? ''
  for (const section of props.sections) {
    const element = document.getElementById(section.id)
    if (element && element.getBoundingClientRect().top <= limit) current = section.id
  }
  activeId.value = current
}

/**
 * Fait défiler la page jusqu'à une section.
 * @param id `id` de la section
 */
function goTo(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  activeId.value = id
  clickedId.value = id
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Rend la main au suivi du défilement (fin du défilement ou geste de l'utilisateur). */
function releaseClick() {
  if (!clickedId.value) return
  clickedId.value = null
  updateActive()
}

const RELEASE_EVENTS = ['scrollend', 'wheel', 'pointerdown', 'keydown'] as const

// Le conteneur, ref du parent, n'est connu qu'après son rendu
watch(
  () => props.container,
  (container, previous) => {
    if (previous) {
      previous.removeEventListener('scroll', updateActive)
      for (const event of RELEASE_EVENTS) previous.removeEventListener(event, releaseClick)
    }
    if (container) {
      container.addEventListener('scroll', updateActive, { passive: true })
      for (const event of RELEASE_EVENTS) container.addEventListener(event, releaseClick, { passive: true })
      updateActive()
    }
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  const container = props.container
  if (!container) return
  container.removeEventListener('scroll', updateActive)
  for (const event of RELEASE_EVENTS) container.removeEventListener(event, releaseClick)
})
</script>

<style scoped>
@reference "tailwindcss";

.settings-nav-item {
  @apply flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm;
  color: var(--p-text-muted-color);
  transition:
    background-color 0.15s,
    color 0.15s;
}

.settings-nav-item:hover {
  color: var(--p-text-color);
  background-color: var(--p-surface-200);
}

.app-dark .settings-nav-item:hover {
  background-color: var(--p-surface-900);
}

.settings-nav-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.settings-nav-item.active {
  @apply font-medium;
  color: var(--p-primary-color);
  background-color: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
</style>
