<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmPopup from 'primevue/confirmpopup'
import Header from './components/Header.vue'
import UndoToast from './components/UndoToast.vue'
import { useSettingsStore } from './stores/Settings'
import { useTaskStore } from './stores/Task'

const settings = useSettingsStore()
const taskStore = useTaskStore()
const route = useRoute()

// Page seule, sans en-tête ni notifications (fenêtre d'ajout rapide)
const bare = computed(() => route.meta.bare === true)

// Tâches ajoutées depuis la fenêtre d'ajout rapide, reçues par la fenêtre principale
let stopQuickAddListener: (() => void) | undefined

// Paramètres chargés et appliqués une seule fois, pour toutes les pages
onMounted(() => {
  settings.load()

  // Cache mis à jour pour toutes les pages, le tableau insère aussi la carte (cf. Kanban)
  if (!bare.value) stopQuickAddListener = globalThis.quickAdd.onTaskCreated((task) => taskStore.insertCachedTask(task))
})

onBeforeUnmount(() => stopQuickAddListener?.())
</script>

<template>
  <router-view v-if="bare" />

  <div v-else class="flex flex-col h-screen">
    <Header />

    <!-- Hauteur restante sous l'en-tête : chaque page gère son propre défilement -->
    <main class="min-h-0 flex-1">
      <router-view />
    </main>

    <!-- Notifications d'erreur (cf. utils/toast.helper.ts) -->
    <Toast position="bottom-right" />

    <!-- Annulation d'une action qui vient d'être faite (cf. useUndoToast) -->
    <UndoToast />

    <!-- Confirmations ancrées sur leur bouton (cf. useConfirm) -->
    <ConfirmPopup data-testid="confirm-popup" />
  </div>
</template>
