<script setup lang="ts">
import { onMounted } from 'vue'
import Toast from 'primevue/toast'
import ConfirmPopup from 'primevue/confirmpopup'
import Header from './components/Header.vue'
import UndoToast from './components/UndoToast.vue'
import { useSettingsStore } from './stores/Settings'

const settings = useSettingsStore()

// Paramètres chargés et appliqués une seule fois, pour toutes les pages
onMounted(() => settings.load())
</script>

<template>
  <div class="flex flex-col h-screen">
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
