<template>
  <div class="drag-container">
    <ul class="drag-list">

      <!-- Affichage des colonnes -->
      <li v-for="stage in stages" :key="stage" class="drag-column">
        <h2>{{ stage }}</h2>

        <!-- Affichage des tâches par colonne -->
        <draggable :list="getTasksByStage(stage)" group="tasks" item-key="id" class="drag-inner-list" @end="onTaskDrop">
          <template #item="{ element }">
            <div class="drag-item" :data-id="element.id">
              <strong>{{ element.title }}</strong>
            </div>
          </template>
        </draggable>

        <div class="drag-column-footer">
          <slot :name="`footer-${stage}`"></slot>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { reactive } from 'vue';
import draggable from 'vuedraggable';
import { useLogger } from 'vue-logger-plugin'

const props = defineProps({
  stages: { type: Array, required: true },
  tasks: { type: Array, default: () => [] },
});

/**
 * Logger
 */
const logger = useLogger();

/**
 * Liste des tâches
 */
const localTasks = reactive([...props.tasks]);

/**
 * Récupération des tâches par colonne
 * @param stage 
 */
function getTasksByStage(stage) {
  return localTasks.filter(task => task.stage === stage);
}

/**
 * Fonction au drop d'une tâche dans une colonne
 * @param evt 
 */
function onTaskDrop(evt) {
  const { item, to } = evt;

  // Récupération de la colonne ou à lieu le drop
  const newStage = props.stages.find(stage => to.closest('.drag-column').querySelector('h2').textContent === stage);

  // Si la colonne existe, réoganisation de la tâche dans la colonne de destination
  if (newStage) {
    const movedTask = localTasks.find(t => t.id == item.dataset.id);
    
    if (movedTask) {
      movedTask.stage = newStage;
      logger.debug(`La tâche "${movedTask.title}" a été déplacée dans la colonne "${newStage}"`);
    }
  }
}
</script>

<style scoped>
.drag-container {
  display: flex;
  overflow-x: auto;
}

.drag-list {
  display: flex;
  gap: 1rem;
  padding: 0;
  list-style: none;
}

.drag-column {
  flex: 1;
  min-width: 250px;
  background: #f4f4f4;
  border-radius: 8px;
  padding: 1rem;
}

.drag-inner-list {
  min-height: 100px;
}

.drag-item {
  background: white;
  border-radius: 4px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  cursor: move;
}
</style>
