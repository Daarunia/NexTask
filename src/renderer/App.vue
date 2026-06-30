<script setup lang="ts">
import Header from "./components/Header.vue";
</script>

<template>
  <div class="flex flex-col h-screen">
    <Header />

    <main class="h-full">
      <router-view />
    </main>
  </div>
</template>
