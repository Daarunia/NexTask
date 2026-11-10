<template>
  <MultiSelect
    v-model="planning.boardIds"
    data-testid="planning-board-filter"
    :aria-label="t('planning.boards.label')"
    :options="boardStore.getAllBoards"
    optionLabel="name"
    optionValue="id"
    :placeholder="t('boards.allBoards')"
    :showToggleAll="false"
    size="small"
    class="planning-board-filter"
  >
    <template #value>{{ label }}</template>
    <template #option="{ option }">
      <span class="flex min-w-0 items-center gap-2">
        <BoardDot :color="option.color" />
        <span class="truncate">{{ option.name }}</span>
      </span>
    </template>
  </MultiSelect>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MultiSelect from 'primevue/multiselect'
import { useI18n } from 'vue-i18n'
import BoardDot from '../BoardDot.vue'
import { useBoardStore } from '../../stores/Board'
import { usePlanningStore } from '../../stores/Planning'

/**
 * Filtre du Planning par tableau : aucune sélection pour tous les tableaux, un
 * ou plusieurs sinon. Ne touche pas au tableau courant du Kanban.
 */
const { t } = useI18n()
const boardStore = useBoardStore()
const planning = usePlanningStore()

// « Tous les tableaux », le nom du tableau seul sélectionné, ou leur nombre
const label = computed(() => {
  const selected = boardStore.getAllBoards.filter((board) => planning.boardIds.includes(board.id))
  if (!selected.length) return t('boards.allBoards')
  return selected.length === 1 ? selected[0].name : t('planning.boards.selected', { count: selected.length })
})
</script>

<style scoped>
.planning-board-filter {
  width: 13rem;
}
</style>
