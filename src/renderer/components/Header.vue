<template>
  <!-- Hauteur fixe, car les raccourcis d'apparence disparaissent sur la page Paramètres -->
  <header class="flex h-14 shrink-0 items-center justify-between p-2 relative select-none">
    <h1 class="ml-4 flex items-center gap-2 text-xl">
      <AppLogo :size="26" style="color: var(--p-primary-color)" />
      <!-- Le texte hérite déjà de la couleur d'accent : seul « Nex » est neutralisé. -->
      <span><span style="color: var(--p-text-color)">Nex</span>Task</span>
    </h1>

    <!-- Recherche globale, propre au tableau -->
    <BoardSearch v-if="isHome" class="mx-4" />

    <div class="flex items-center gap-2" ref="menuWrapper">
      <!-- Console du navigateur : toujours en dev, sur demande en prod (cf. Paramètres) -->
      <Button
        v-if="isDev || settings.showDevToolsButton"
        data-testid="btn-devtools"
        v-tooltip.bottom="t('header.devTools')"
        :aria-label="t('header.devTools')"
        text
        rounded
        @click="toggleDevTools"
      >
        <template #icon>
          <!-- Invite de commande « >_ », absente de PrimeIcons -->
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </template>
      </Button>

      <!-- Raccourcis d'apparence, masqués sur la page Paramètres qui propose les mêmes réglages -->
      <template v-if="!isSettings">
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
      </template>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import PrimaryColorPicker from './PrimaryColorPicker.vue'
import AppLogo from './AppLogo.vue'
import BoardSearch from './BoardSearch.vue'
import { useSettingsStore } from '../stores/Settings.js'
import { useErrorToast } from '../utils/toast.helper.js'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

// Paramètres chargés et appliqués par App.vue, l'en-tête ne fait que les lire
const settings = useSettingsStore()
const { t } = useI18n()
const showError = useErrorToast()
const palettePopover = ref<InstanceType<typeof Popover> | null>(null)
const route = useRoute()

// Bascule vers le mode inverse de celui affiché (quitte le mode « système »)
async function toggleTheme() {
  try {
    await settings.set('theme', settings.isDark ? 'light' : 'dark')
  } catch {
    showError(t('header.themeNotSaved'))
  }
}

// Ouverture et fermeture de la palette (clic extérieur et Échap gérés par le Popover)
function togglePalette(event: MouseEvent) {
  palettePopover.value?.toggle(event)
}

// Serveur Vite du dev : le bouton de la console y est toujours affiché
const isDev = import.meta.env.DEV

function toggleDevTools() {
  window.devTools.toggle()
}

// Page courante, la navigation passe par le rail (cf. AppRail)
const isHome = computed(() => route.name === 'Home')
const isSettings = computed(() => route.name === 'Settings')
</script>
