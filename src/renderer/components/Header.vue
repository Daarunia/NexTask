<template>
  <header class="flex items-center justify-between p-2 relative select-none">
    <h1 class="ml-4 flex items-center gap-2 text-xl">
      <AppLogo :size="26" style="color: var(--p-primary-color)" />
      <!-- Le texte hérite déjà de la couleur d'accent : seul « Nex » est neutralisé. -->
      <span><span style="color: var(--p-text-color)">Nex</span>Task</span>
    </h1>

    <div class="flex items-center gap-2" ref="menuWrapper">
      <!-- Bouton Dark / Light -->
      <Button
        data-testid="btn-theme"
        :icon="settings.isDark ? 'pi pi-sun' : 'pi pi-moon'"
        text
        rounded
        @click="toggleTheme"
      />

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
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import PrimaryColorPicker from './PrimaryColorPicker.vue'
import AppLogo from './AppLogo.vue'
import { useSettingsStore } from '../stores/Settings.js'
import { useErrorToast } from '../utils/toast.helper.js'
import { useRouter, useRoute } from 'vue-router'

// Paramètres chargés et appliqués par App.vue, l'en-tête ne fait que les lire
const settings = useSettingsStore()
const showError = useErrorToast()
const palettePopover = ref<InstanceType<typeof Popover> | null>(null)
const router = useRouter()
const route = useRoute()

async function toggleTheme() {
  try {
    await settings.setTheme(settings.isDark ? 'light' : 'dark')
  } catch {
    showError('Thème non enregistré')
  }
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
