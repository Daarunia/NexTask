<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmPopup from 'primevue/confirmpopup'
import Header from './components/Header.vue'
import UndoToast from './components/UndoToast.vue'
import UpdateToast from './components/UpdateToast.vue'
import { useSettingsStore } from './stores/Settings'
import { useTaskStore } from './stores/Task'
import { useTagStore } from './stores/Tag'
import { useUpdateStore } from './stores/Update'

const settings = useSettingsStore()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const updateStore = useUpdateStore()
const route = useRoute()
const router = useRouter()

// Page seule, sans en-tête ni notifications (fenêtre d'ajout rapide)
const bare = computed(() => route.meta.bare === true)

// Tâches ajoutées depuis la fenêtre d'ajout rapide, reçues par la fenêtre principale
let stopQuickAddListener: (() => void) | undefined

// Occurrences des tâches récurrentes créées par le main
let stopRecurrenceListener: (() => void) | undefined

// Tâche à ouvrir après un clic sur sa notification de rappel
let stopOpenTaskListener: (() => void) | undefined

// Paramètres chargés et appliqués une seule fois, pour toutes les pages
onMounted(() => {
  settings.load()

  // État de la mise à jour, pour la section « À propos » et le toast de redémarrage
  if (!bare.value) updateStore.load()

  // Cache mis à jour pour toutes les pages, le tableau insère aussi la carte (cf. Kanban)
  if (!bare.value) stopQuickAddListener = globalThis.quickAdd.onTaskCreated((task) => taskStore.insertCachedTask(task))

  // Même chose pour les occurrences, dont les tags gagnent une tâche
  if (!bare.value) {
    stopRecurrenceListener = globalThis.recurrence.onTasksCreated((tasks) => {
      for (const task of tasks) {
        taskStore.insertCachedTask(task)
        tagStore.adjustTaskCounts(
          (task.tags ?? []).map((tag) => tag.id),
          [],
        )
      }
    })
  }

  // Clic sur une notification qui n'annonçait qu'une tâche : retour au tableau, qui l'ouvre
  if (!bare.value) {
    stopOpenTaskListener = globalThis.notifications.onOpenTask((taskId) => {
      taskStore.requestOpenTask(taskId)
      router.push({ name: 'Home' })
    })
  }
})

onBeforeUnmount(() => {
  stopQuickAddListener?.()
  stopRecurrenceListener?.()
  stopOpenTaskListener?.()
  updateStore.stop()
})
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

    <!-- Nouvelle version téléchargée, redémarrage proposé (cf. stores/Update) -->
    <UpdateToast />

    <!-- Confirmations ancrées sur leur bouton (cf. useConfirm) -->
    <ConfirmPopup data-testid="confirm-popup" />
  </div>
</template>
