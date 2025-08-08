<script setup lang="ts">
import Kanban from '../components/Kanban.vue' 
</script>

<template>
  <Kanban :stages=" ['A faire', 'En attente', 'En cours', 'Terminé']" :tasks="[
    {
      id: 1,
      stage: 'En attente',
      title: 'Test',
    },
    {
      id: 2,
      stage: 'En attente',
      title: 'Prout',
    }
  ]"></Kanban>
</template>