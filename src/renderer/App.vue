<script setup lang="ts">
import { onMounted } from 'vue'
import Toast from 'primevue/toast'
import Header from './components/Header.vue'
import { useSettingsStore } from './stores/Settings'

const settings = useSettingsStore()

// Paramètres chargés et appliqués une seule fois, pour toutes les pages
onMounted(() => settings.load())
</script>

<template>
  <div class="flex flex-col h-screen">
    <Header />

    <main class="h-full">
      <router-view />
    </main>

    <!-- Notifications d'erreur (cf. utils/toast.helper.ts) -->
    <Toast position="bottom-right" />
  </div>
</template>
