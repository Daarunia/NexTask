<template>
  <ContextMenu
    ref="menu"
    :model="items"
    data-testid="card-menu"
    :aria-label="t('board.cardMenu.label', { title: task?.title ?? '' })"
    @hide="onHide"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ContextMenu from 'primevue/contextmenu'
import { useTagStore } from '../stores/Tag'
import type { Task } from '../types/task.types'
import type { Stage } from '../types/stage.types'
import type { Tag } from '../types/tag.types'
import { compareTagNames } from '../utils/tag.helper'
import { quickStartDate, type QuickDay } from '../utils/date.helper'
import { getTagColorStyle } from '../constants/tag.constants'

/**
 * Menu contextuel des cartes du tableau (clic droit, ou touche Menu sur le
 * titre), une seule instance pour tout le tableau. Il propose les actions de
 * la carte et les remonte au Kanban, qui les fait : ouvrir, dupliquer, tags,
 * date de début, déplacement et archivage.
 */

/** Place de la carte dans sa colonne à l'ouverture du menu. */
export interface CardPlace {
  stageId: number
  index: number
  count: number // nombre de cartes de la colonne
}

const props = defineProps<{
  stages: Stage[] // colonnes du tableau, dans l'ordre
}>()

const emit = defineEmits<{
  open: [taskId: number]
  duplicate: [task: Task]
  'toggle-tag': [task: Task, tagId: number]
  'start-date': [task: Task, startDate: Date | null]
  move: [taskId: number, stageId: number, place: 'top' | 'bottom']
  archive: [task: Task, card: HTMLElement | null]
}>()

// Jours proposés dans le sous-menu « Date de début »
const QUICK_DAYS: QuickDay[] = ['today', 'tomorrow', 'nextMonday']

// Nombre de tags proposés, en plus de ceux que la carte porte
const MENU_TAG_COUNT = 12

const { t } = useI18n()
const tagStore = useTagStore()

const menu = ref<InstanceType<typeof ContextMenu> | null>(null)
const task = ref<Task | null>(null)
const place = ref<CardPlace | null>(null)
let card: HTMLElement | null = null // carte affichée, ancre d'une confirmation d'archivage
let trigger: HTMLElement | null = null // titre de la carte, qui reprend le focus à la fermeture

/**
 * Tags proposés : ceux que la carte porte, puis les plus utilisés, le tout
 * trié par nom.
 * @param current Tâche de la carte
 */
function menuTags(current: Task): Tag[] {
  const carried = new Set((current.tags ?? []).map((tag) => tag.id))
  const mostUsed = tagStore.getAllTags
    .filter((tag) => !carried.has(tag.id))
    .sort((a, b) => (b.taskCount ?? 0) - (a.taskCount ?? 0))
    .slice(0, MENU_TAG_COUNT)
  return [...tagStore.getAllTags.filter((tag) => carried.has(tag.id)), ...mostUsed].sort(compareTagNames)
}

// Calculé pour suivre la langue de l'interface
const items = computed(() => {
  const current = task.value
  const at = place.value
  if (!current || !at) return []

  const otherStages = props.stages.filter((stage) => stage.id !== at.stageId)
  const startDate = current.startDate ? new Date(current.startDate) : null

  return [
    { label: t('board.cardMenu.open'), icon: 'pi pi-pencil', command: () => emit('open', current.id) },
    { label: t('board.cardMenu.duplicate'), icon: 'pi pi-copy', command: () => emit('duplicate', current) },
    { separator: true },
    {
      label: t('board.cardMenu.tags'),
      icon: 'pi pi-tag',
      disabled: !tagStore.getAllTags.length,
      items: menuTags(current).map((tag) => ({
        label: tag.name,
        icon: 'pi pi-circle-fill',
        class: [
          'menu-swatch-option',
          { 'menu-option-current': current.tags?.some((carried) => carried.id === tag.id) },
        ],
        style: { '--swatch': getTagColorStyle(tag.color).swatch },
        command: () => emit('toggle-tag', current, tag.id),
      })),
    },
    {
      label: t('board.cardMenu.startDate'),
      icon: 'pi pi-calendar',
      items: [
        ...QUICK_DAYS.map((day) => ({
          label: t(`board.cardMenu.${day}`),
          command: () => emit('start-date', current, quickStartDate(day, startDate, new Date())),
        })),
        {
          label: t('board.cardMenu.clearDate'),
          disabled: !startDate,
          command: () => emit('start-date', current, null),
        },
      ],
    },
    {
      label: t('board.cardMenu.moveTo'),
      icon: 'pi pi-arrow-right',
      disabled: !otherStages.length,
      items: otherStages.map((stage) => ({
        label: stage.name,
        command: () => emit('move', current.id, stage.id, 'bottom'),
      })),
    },
    {
      label: t('board.cardMenu.moveTop'),
      icon: 'pi pi-arrow-up',
      disabled: at.index === 0,
      command: () => emit('move', current.id, at.stageId, 'top'),
    },
    {
      label: t('board.cardMenu.moveBottom'),
      icon: 'pi pi-arrow-down',
      disabled: at.index === at.count - 1,
      command: () => emit('move', current.id, at.stageId, 'bottom'),
    },
    { separator: true },
    {
      label: t('common.archive'),
      icon: 'pi pi-box',
      // Après la fermeture du menu, pour que la confirmation ne soit pas refermée aussitôt
      command: () => {
        const anchor = card
        setTimeout(() => emit('archive', current, anchor))
      },
    },
  ]
})

/**
 * Ouvre le menu d'une carte, à la place du clic droit (ou sous le titre,
 * ouvert au clavier).
 * @param event Clic droit, ou touche Menu sur le titre
 * @param cardTask Tâche de la carte, telle qu'affichée
 * @param cardPlace Place de la carte dans sa colonne
 */
function show(event: MouseEvent, cardTask: Task, cardPlace: CardPlace) {
  task.value = cardTask
  place.value = cardPlace
  trigger = event.currentTarget as HTMLElement
  card = trigger.closest('[data-testid="task-card"]')
  menu.value?.show(event)
}

/**
 * Fermeture du menu. Si le focus était dans le menu (Échap, choix au clavier),
 * il revient sur le titre de la carte plutôt que sur la page. Un clic ailleurs
 * a déjà placé le focus, il n'est pas déplacé.
 */
function onHide() {
  task.value = null
  const title = trigger

  setTimeout(() => {
    const active = document.activeElement
    if (!active || active === document.body || active.closest('[data-testid="card-menu"]')) title?.focus()
  })
}

defineExpose({ show })
</script>
