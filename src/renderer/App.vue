<script setup lang="ts">
import Home from "./pages/Home.vue";
import AppHeader from "./components/AppHeader.vue";
</script>

<template>
  <div class="flex flex-col h-screen">
    <AppHeader />

    <main class="h-full">
      <Home />
    </main>
  </div>
</template>
