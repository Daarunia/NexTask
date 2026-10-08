<template>
  <!-- Largeur prévue pour la barre d'outils de l'éditeur Markdown de la description -->
  <Dialog v-model:visible="visible" :modal="true" :show-header="false" :draggable="true" class="max-w-2xl w-full">
    <!-- Le contenu du Dialog est démonté à la fermeture, donc le formulaire repart
         de initialValues à chaque ouverture, sans erreur résiduelle -->
    <!-- Raccourcis d'enregistrement écoutés en capture : avant l'éditeur Markdown,
         qui réserve aussi Ctrl+S et Ctrl+Entrée -->
    <Form
      ref="formRef"
      v-slot="$form"
      :initialValues="initialValues"
      :resolver="resolver"
      data-testid="task-dialog"
      class="pt-4 flex flex-col gap-4"
      @submit="onSubmit"
      @keydown.capture="onSaveShortcut"
    >
      <!-- Titre -->
      <div class="flex flex-col gap-2 w-full">
        <label for="inputValue" class="font-medium">{{ t('task.dialog.title') }}</label>
        <InputText
          id="inputValue"
          name="title"
          data-testid="task-title-input"
          :placeholder="t('task.dialog.titlePlaceholder')"
        />
        <Message
          v-if="$form.title?.invalid"
          severity="error"
          size="small"
          variant="simple"
          data-testid="task-title-error"
        >
          {{ $form.title.error?.message }}
        </Message>
      </div>

      <!-- Description -->
      <!-- Description en Markdown : ouverte en aperçu si la tâche en a déjà une -->
      <FormField v-slot="$field" name="description">
        <component
          :is="MarkdownEditor"
          v-if="MarkdownEditor"
          id="description"
          :label="t('task.dialog.description')"
          testId="task-description"
          :placeholder="t('task.dialog.descriptionPlaceholder')"
          :modelValue="$field.value ?? ''"
          :startInPreview="!!initialValues.description?.trim()"
          @update:modelValue="(value: string) => $field.props.onChange({ value })"
        />
      </FormField>

      <!-- Tags : valeur du formulaire = TagSelection[] -->
      <div class="flex flex-col gap-2 w-full">
        <span class="font-medium">{{ t('task.dialog.tags') }}</span>
        <FormField v-slot="$field" name="tags">
          <TagSelect
            ref="tagSelectRef"
            :modelValue="$field.value ?? []"
            @update:modelValue="(value: TagSelection[]) => $field.props.onChange({ value })"
          />
        </FormField>
        <Message v-if="$form.tags?.invalid" severity="error" size="small" variant="simple">
          {{ $form.tags.error?.message }}
        </Message>
      </div>

      <!-- Version -->
      <div class="flex flex-col gap-2 w-full">
        <label for="version" class="font-medium">{{ t('task.dialog.version') }}</label>
        <Select
          id="version"
          name="version"
          data-testid="task-version-select"
          :options="versions"
          optionLabel="label"
          optionValue="value"
          :placeholder="t('task.dialog.versionPlaceholder')"
        />
        <Message v-if="$form.version?.invalid" severity="error" size="small" variant="simple">
          {{ $form.version.error?.message }}
        </Message>
      </div>

      <!-- Date de début -->
      <div class="flex flex-col gap-2 w-full">
        <label for="startDate" class="font-medium">{{ t('task.dialog.startDate') }}</label>
        <DatePicker
          id="startDate"
          name="startDate"
          data-testid="task-startdate-input"
          showTime
          hourFormat="24"
          showButtonBar
          :placeholder="t('task.dialog.startDatePlaceholder')"
        />
        <Message
          v-if="$form.startDate?.invalid"
          severity="error"
          size="small"
          variant="simple"
          data-testid="task-startdate-error"
        >
          {{ $form.startDate.error?.message }}
        </Message>
      </div>

      <!-- Répéter : valeur du formulaire = RecurrenceFormValue -->
      <FormField v-slot="$field" name="recurrence">
        <RecurrenceFields
          :modelValue="$field.value ?? defaultRecurrenceValue()"
          :startDate="$form.startDate?.value ?? null"
          :series="series"
          :error="$field.invalid ? $field.error?.message : undefined"
          @update:modelValue="(value) => $field.props.onChange({ value })"
          @need-start-date="$form.setFieldValue('startDate', defaultStartDate())"
        />
      </FormField>

      <!-- Contenu reporté sur les prochaines occurrences (modification d'une
           occurrence). Masqué plutôt que retiré : le champ reste dans le formulaire. -->
      <div v-show="seriesLive && $form.recurrence?.value?.preset !== 'none'" class="flex items-center gap-2">
        <Checkbox inputId="applyToSeries" name="applyToSeries" binary data-testid="task-apply-to-series" />
        <label for="applyToSeries">{{ t('task.dialog.applyToSeries') }}</label>
      </div>

      <!-- Boutons -->
      <div class="flex gap-2 w-full">
        <Button
          type="button"
          :label="t('common.cancel')"
          data-testid="task-cancel-btn"
          severity="secondary"
          class="flex-1"
          @click="visible = false"
        />
        <Button
          type="submit"
          :label="t('common.save')"
          v-tooltip.top="infoTooltip(t('task.dialog.saveShortcut'))"
          data-testid="task-save-btn"
          severity="success"
          class="flex-1"
        />
      </div>
    </Form>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, PropType, type Component } from 'vue'
import { Form, FormField, type FormSubmitEvent } from '@primevue/forms'
import { zodResolver } from '@primevue/forms/resolvers/zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Checkbox from 'primevue/checkbox'
import TagSelect from './TagSelect.vue'
import RecurrenceFields from './RecurrenceFields.vue'
import { Task, TaskInput, TaskUpdateInput } from '../types/task.types'
import { TagSelection } from '../types/tag.types'
import { taskFormSchema, TaskFormValues } from '../schemas/task.schema'
import type { RecurrenceInput, RecurrenceStatus, RecurrenceSummary } from '../../main/shared/recurrence.constants'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { getLogger } from '../utils/logger'
import { useErrorToast, useUndoToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import { infoTooltip } from '../utils/tooltip.helper'
import {
  defaultRecurrenceValue,
  sameRecurrenceInput,
  summaryToInput,
  toRecurrenceInput,
  toRecurrenceValue,
} from '../utils/recurrence.helper'
import { useI18n } from 'vue-i18n'

// Éditeur Markdown (md-editor-v3 et CodeMirror) dans un chunk à part, pour ne pas
// alourdir le démarrage : préchargé au montage, et attendu avant d'ouvrir le
// dialogue. Le formulaire s'affiche d'un bloc, sans que la description apparaisse
// après coup et décale les champs suivants (et le popover des tags ouvert dessus).
const MarkdownEditor = shallowRef<Component | null>(null)

/** Charge l'éditeur Markdown une seule fois. */
async function loadMarkdownEditor() {
  MarkdownEditor.value ??= (await import('./MarkdownEditor.vue')).default
}

onMounted(() => {
  loadMarkdownEditor().catch((error) => logger.error("Chargement de l'éditeur Markdown impossible", error))
})

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  stageId: {
    type: Number,
    required: true,
  },
  position: {
    type: Number,
    required: true,
  },
  editTask: {
    type: Object as PropType<Task | null | undefined>,
  },
  creationMode: {
    type: Boolean,
    required: true,
  },
  // Tags pré-remplis à la création
  defaultTags: {
    type: Array as PropType<TagSelection[]>,
    default: () => [],
  },
})

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'task-saved', task: Task): void
}>()

// Paramètres : versions proposées et version par défaut
const settings = useSettingsStore()
const { t } = useI18n()

// State
const visible = ref(props.modelValue)
const stageId = ref(props.stageId)
const position = ref(props.position)

// Valeurs de départ du formulaire, relues par <Form> à chaque ouverture
const initialValues = ref<TaskFormValues>(defaultValues())

/**
 * Versions proposées : celles des paramètres, plus celle de la tâche éditée
 * si elle n'y figure plus (retirée depuis), pour ne pas vider le champ.
 */
const versions = computed(() => {
  const list = [...settings.taskVersions]
  const current = props.editTask?.version
  if (!props.creationMode && current && !list.includes(current)) list.push(current)
  return list.map((version) => ({ label: version, value: version }))
})

const resolver = zodResolver(taskFormSchema)

// Logger & Store
const logger = getLogger()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const showError = useErrorToast()
const showUndo = useUndoToast()

// Série de la tâche modifiée, dans son dernier état connu (absente à la création)
const series = computed(() =>
  props.creationMode || !props.editTask
    ? null
    : (taskStore.getRecurrence(props.editTask.recurrenceId) ?? props.editTask.recurrence ?? null),
)

// Série encore en cours (active ou en pause) : modifiable et arrêtable depuis la tâche
const seriesLive = computed(() => !!series.value && series.value.status !== 'ended')

// Sélecteur de tags, pour enregistrer un renommage en cours avant la tâche
const tagSelectRef = ref<InstanceType<typeof TagSelect> | null>(null)

// Formulaire, soumis aussi par les raccourcis clavier (même validation que le bouton Enregistrer)
const formRef = ref<{ submit: () => void } | null>(null)

// Sauvegarde en cours
const saving = ref(false)

// Sync ouverture / fermeture
watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      stageId.value = props.stageId
      position.value = props.position

      if (props.creationMode) {
        initialValues.value = defaultValues()
      } else if (props.editTask) {
        // La date arrive en chaîne ISO via HTTP, on la reconvertit en Date pour le DatePicker
        const startDate = props.editTask.startDate ? new Date(props.editTask.startDate) : null
        initialValues.value = {
          title: props.editTask.title,
          description: props.editTask.description,
          version: props.editTask.version,
          startDate,
          tags: toTagSelection(props.editTask),
          recurrence: toRecurrenceValue(series.value, startDate),
          applyToSeries: true,
        }
      }

      // Éditeur prêt avant l'affichage (déjà chargé au montage, sauf ouverture très rapide)
      try {
        await loadMarkdownEditor()
      } catch (error) {
        logger.error("Chargement de l'éditeur Markdown impossible", error)
      }
      // Fermé entre-temps : ne pas le rouvrir
      if (!props.modelValue) return
    }

    visible.value = val
  },
)

watch(visible, (val) => emit('update:modelValue', val))

// Valeurs par défaut d'une nouvelle tâche
function defaultValues(): TaskFormValues {
  return {
    title: '',
    description: '',
    version: settings.defaultTaskVersion,
    startDate: null,
    tags: props.defaultTags.map((tag) => ({ ...tag })),
    recurrence: defaultRecurrenceValue(),
    applyToSeries: true,
  }
}

/** Date de début proposée quand une répétition est choisie sans date : aujourd'hui à 09:00. */
function defaultStartDate(): Date {
  const date = new Date()
  date.setHours(9, 0, 0, 0)
  return date
}

/**
 * Répétition à envoyer à la modification d'une tâche : rien si la règle de
 * sa série n'a pas changé (la série garde son calendrier), `null` pour arrêter
 * une série en cours, sinon la nouvelle règle.
 * @param input Règle choisie, null pour « Ne pas répéter »
 */
function recurrenceChange(input: RecurrenceInput | null): RecurrenceInput | null | undefined {
  const current = seriesLive.value && series.value ? summaryToInput(series.value) : null
  if (!input) return current ? null : undefined
  return current && sameRecurrenceInput(input, current) ? undefined : input
}

/**
 * Rend à une série arrêtée depuis le formulaire son état d'avant (bouton
 * « Annuler » du toast) : active, elle repart sans rattrapage (de maintenant
 * selon le calendrier, en attente de l'archivage sinon) ; en pause, elle y reste
 * @param id Id de la série
 * @param status État de la série avant l'arrêt
 */
async function resumeSeries(id: number, status: RecurrenceStatus) {
  try {
    await taskStore.updateRecurrenceStatus(id, status)
  } catch {
    showError(t('task.dialog.undoFailed'), t('task.dialog.resumeFailedDetail'))
  }
}

/**
 * Tags d'une tâche existante en valeur de formulaire, triés par nom actuel.
 * Les tags supprimés depuis le chargement de la tâche sont écartés ; un tag que
 * le cache ne connaît pas encore est gardé avec le nom porté par la tâche, pour
 * ne pas le retirer en silence à l'enregistrement.
 * @param task Tâche éditée
 */
function toTagSelection(task: Task): TagSelection[] {
  return (task.tags ?? [])
    .filter((t) => !tagStore.wasDeleted(t.id))
    .map((t) => tagStore.getTagById(t.id) ?? t)
    .sort(compareTagNames)
    .map((tag) => ({ id: tag.id, name: tag.name }))
}

/**
 * Noms des tags à envoyer au serveur. Un tag existant est converti en son nom
 * actuel (il a pu être renommé depuis le menu d'édition, renvoyer l'ancien nom
 * recréerait un tag) et un tag supprimé entre-temps est ignoré. Un tag sans id,
 * que le sélecteur ne produit plus (création immédiate), ou inconnu du cache,
 * garde le nom de la sélection.
 * @param selection Valeur du champ tags
 */
function toTagNames(selection: TagSelection[]): string[] {
  return selection.flatMap((selected) => {
    if (selected.id === undefined) return [selected.name]
    if (tagStore.wasDeleted(selected.id)) return []

    return [tagStore.getTagById(selected.id)?.name ?? selected.name]
  })
}

/**
 * Ctrl+S ou Ctrl+Entrée (Cmd sur macOS), depuis n'importe quel champ :
 * enregistre la tâche comme le bouton Enregistrer, validation comprise.
 * @param event Touche pressée dans le formulaire
 */
function onSaveShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  if (event.key !== 'Enter' && event.key.toLowerCase() !== 's') return

  // Ni enregistrement de la page par le navigateur, ni nouvelle ligne dans l'éditeur
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) formRef.value?.submit()
}

// Soumission, sachant que <Form> émet submit même si la validation échoue
function onSubmit({ valid, values }: FormSubmitEvent) {
  if (!valid) {
    logger.debug('Formulaire de tâche invalide, sauvegarde annulée')
    return
  }

  saveTask(values as TaskFormValues)
}

// Sauvegarde (valeurs déjà validées et nettoyées par le schéma)
async function saveTask(values: TaskFormValues) {
  // Une seule à la fois : un double clic ou un raccourci répété ne crée pas la tâche deux fois
  if (saving.value) return
  saving.value = true

  logger.debug('Début sauvegarde tâche :', {
    stageId: stageId.value,
    title: values.title,
    version: values.version,
    position: position.value,
  })

  try {
    // Une création, un renommage ou une suppression de tag peut être encore en
    // vol (nom tapé puis clic direct sur Save) : le sélecteur termine tout et
    // renvoie la sélection finale, les valeurs de soumission étant figées au clic.
    // Un renommage refusé laisse le nom d'origine, avec lequel la tâche est enregistrée.
    const selection = (await tagSelectRef.value?.settle()) ?? values.tags
    const tagNames = toTagNames(selection)
    const recurrenceInput = toRecurrenceInput(values.recurrence, values.startDate)

    let savedTask: Task | undefined
    let stopped: Pick<RecurrenceSummary, 'id' | 'status'> | null = null

    if (props.creationMode) {
      const newTask: TaskInput = {
        stageId: stageId.value,
        title: values.title,
        version: values.version,
        position: position.value,
        description: values.description,
        isHistorized: false,
        historizationDate: undefined,
        startDate: values.startDate,
        tags: tagNames,
        ...(recurrenceInput && { recurrence: recurrenceInput }),
      }

      savedTask = await taskStore.saveTask(newTask)
      logger.info('Tâche créée avec succès', savedTask)
    } else if (props.editTask) {
      // Sans position : le dialogue ne déplace pas la carte, et la place affichée
      // peut différer de la position enregistrée (trous laissés par un archivage)
      const updatedTask: TaskUpdateInput = {
        id: props.editTask.id,
        stageId: stageId.value,
        title: values.title,
        version: values.version,
        description: values.description,
        isHistorized: props.editTask.isHistorized,
        historizationDate: props.editTask.historizationDate,
        startDate: values.startDate,
        tags: tagNames,
        recurrence: recurrenceChange(recurrenceInput),
        applyToSeries: values.applyToSeries,
      }
      if (updatedTask.recurrence === null && series.value) {
        stopped = { id: series.value.id, status: series.value.status }
      }

      savedTask = await taskStore.updateTask(updatedTask)
      logger.info('Tâche mise à jour avec succès', savedTask)
    } else {
      logger.error('Aucune tâche à mettre à jour')
      return
    }

    if (savedTask) {
      emit('task-saved', savedTask)
    }

    // Série arrêtée : annulable quelques secondes, elle retrouve alors son état
    if (stopped) {
      const { id, status } = stopped
      showUndo(t('task.dialog.seriesStopped'), { detail: savedTask?.title, undo: () => resumeSeries(id, status) })
    }

    emit('update:modelValue', false)
  } catch (error) {
    // Le dialogue reste ouvert : la saisie n'est pas perdue et peut être renvoyée
    logger.error('Erreur lors de la sauvegarde', error)
    showError(t('task.dialog.saveFailed'), t('task.dialog.saveFailedDetail'))
  } finally {
    saving.value = false
  }
}
</script>
