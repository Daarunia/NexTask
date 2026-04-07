<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
</script>

<template>
  <div class="flex flex-col h-screen">
    <AppHeader />

    <main class="h-full">
      <router-view />
    </main>
  </div>
</template>
