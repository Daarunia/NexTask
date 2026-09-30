<template>
  <header class="flex items-center justify-between p-2 relative select-none">
    <h1 class="ml-4 flex items-center gap-2 text-xl">
      <AppLogo :size="26" style="color: var(--p-primary-color)" />
      <!-- Le texte hérite déjà de la couleur d'accent : seul « Nex » est neutralisé. -->
      <span><span style="color: var(--p-text-color)">Nex</span>Task</span>
    </h1>

    <div class="flex items-center gap-2" ref="menuWrapper">
      <!-- Bouton Dark / Light -->
      <Button data-testid="btn-theme" :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'" text rounded @click="toggleTheme" />

      <!-- Bouton Palette -->
      <Button data-testid="btn-palette" icon="pi pi-palette" text rounded @click="togglePalette" />

      <!-- Panneau Palette -->
      <Popover ref="palettePopover">
        <PrimaryColorPicker />
      </Popover>

      <Button data-testid="btn-home" icon="pi pi-home" @click="goHome" v-if="!isHome" text rounded />
      <!--<<Button data-testid="btn-settings" icon="pi pi-cog" @click="goSettings" v-if="!isSettings" text rounded />-->
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import PrimaryColorPicker from './PrimaryColorPicker.vue'
import AppLogo from './AppLogo.vue'
import { useSettingsStore } from '../stores/Settings.js'
import { getLogger } from '../utils/logger.js'
import { getAppTheme } from '../constants/theme.constants.js'
import { applyTheme } from '../utils/theme.helper.js'
import { useRouter, useRoute } from 'vue-router'

const settings = useSettingsStore()
const isDark = ref(false)
const palettePopover = ref<InstanceType<typeof Popover> | null>(null)
const router = useRouter()
const route = useRoute()

onMounted(async () => {
  await settings.load() // Chargement des paramètres
  isDark.value = settings.theme === 'dark'
  getLogger().debug(`[Header] Theme loaded from store: ${settings.theme}`)

  // Application du theme
  document.documentElement.classList.toggle('app-dark', isDark.value)

  // Application du thème de couleur (une ancienne couleur est ramenée au thème le plus proche)
  getLogger().debug(`[Header] Couleur chargée depuis les paramètres : ${settings.primaryColor}`)
  applyTheme(getAppTheme(settings.primaryColor))
})

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('app-dark', isDark.value)

  // persistance
  settings.setTheme(isDark.value ? 'dark' : 'light')
}

// Ouverture et fermeture de la palette (clic extérieur et Échap gérés par le Popover)
function togglePalette(event: MouseEvent) {
  palettePopover.value?.toggle(event)
}

// Affichage des views
const goHome = () => router.push({ name: 'Home' })
const goSettings = () => router.push({ name: 'Settings' })
const isHome = computed(() => route.name === 'Home')
const isSettings = computed(() => route.name === 'Settings')
</script>
