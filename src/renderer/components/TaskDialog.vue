<template>
  <Dialog v-model:visible="visible" :modal="true" :show-header="false" :draggable="true" class="max-w-md w-full">
    <!-- Le contenu du Dialog est démonté à la fermeture, donc le formulaire repart
         de initialValues à chaque ouverture, sans erreur résiduelle -->
    <Form
      v-slot="$form"
      :initialValues="initialValues"
      :resolver="resolver"
      data-testid="task-dialog"
      class="pt-4 flex flex-col gap-4"
      @submit="onSubmit"
    >
      <!-- Titre -->
      <div class="flex flex-col gap-2 w-full">
        <label for="inputValue" class="font-medium">Titre</label>
        <InputText id="inputValue" name="title" data-testid="task-title-input" placeholder="Décris ton titre ici..." />
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
      <div class="flex flex-col gap-2 w-full">
        <label for="description" class="font-medium"> Description </label>
        <Textarea
          id="description"
          name="description"
          data-testid="task-description-input"
          autoResize
          rows="4"
          class="resize-y"
          placeholder="Décris ta tâche ici..."
        />
      </div>

      <!-- Tags : valeur du formulaire = TagSelection[] -->
      <div class="flex flex-col gap-2 w-full">
        <span class="font-medium">Tags</span>
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
        <label for="version" class="font-medium">Version</label>
        <Select
          id="version"
          name="version"
          data-testid="task-version-select"
          :options="versions"
          optionLabel="label"
          optionValue="value"
          placeholder="Sélectionne une version"
        />
        <Message v-if="$form.version?.invalid" severity="error" size="small" variant="simple">
          {{ $form.version.error?.message }}
        </Message>
      </div>

      <!-- Date de début -->
      <div class="flex flex-col gap-2 w-full">
        <label for="startDate" class="font-medium">Date de début</label>
        <DatePicker
          id="startDate"
          name="startDate"
          data-testid="task-startdate-input"
          showTime
          hourFormat="24"
          showButtonBar
          dateFormat="dd/mm/yy"
          placeholder="Date de début de la tâche"
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
          @update:modelValue="(value: RecurrenceFormValue) => $field.props.onChange({ value })"
          @need-start-date="$form.setFieldValue('startDate', defaultStartDate())"
        />
      </FormField>

      <!-- Contenu reporté sur les prochaines occurrences (modification d'une
           occurrence). Masqué plutôt que retiré : le champ reste dans le formulaire. -->
      <div v-show="seriesLive && $form.recurrence?.value?.preset !== 'none'" class="flex items-center gap-2">
        <Checkbox inputId="applyToSeries" name="applyToSeries" binary data-testid="task-apply-to-series" />
        <label for="applyToSeries">Appliquer aux prochaines occurrences</label>
      </div>

      <!-- Boutons -->
      <div class="flex gap-2 w-full">
        <Button
          type="button"
          label="Cancel"
          data-testid="task-cancel-btn"
          severity="secondary"
          class="flex-1"
          @click="visible = false"
        />
        <Button type="submit" label="Save" data-testid="task-save-btn" severity="success" class="flex-1" />
      </div>
    </Form>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, PropType } from 'vue'
import { Form, FormField, type FormSubmitEvent } from '@primevue/forms'
import { zodResolver } from '@primevue/forms/resolvers/zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Checkbox from 'primevue/checkbox'
import TagSelect from './TagSelect.vue'
import RecurrenceFields from './RecurrenceFields.vue'
import { Task, TaskInput } from '../types/task.types'
import { TagSelection } from '../types/tag.types'
import { RecurrenceFormValue, taskFormSchema, TaskFormValues } from '../schemas/task.schema'
import type { RecurrenceInput, RecurrenceStatus, RecurrenceSummary } from '../../main/shared/recurrence.constants'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { getLogger } from '../utils/logger'
import { useErrorToast, useUndoToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import {
  defaultRecurrenceValue,
  sameRecurrenceInput,
  summaryToInput,
  toRecurrenceInput,
  toRecurrenceValue,
} from '../utils/recurrence.helper'

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

// Sync ouverture / fermeture
watch(
  () => props.modelValue,
  (val) => {
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
    showError('Annulation impossible', "La série n'a pas été relancée.")
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
      const updatedTask: TaskInput & Pick<Task, 'id'> = {
        id: props.editTask.id,
        stageId: stageId.value,
        title: values.title,
        version: values.version,
        position: position.value,
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
      showUndo('Série arrêtée', { detail: savedTask?.title, undo: () => resumeSeries(id, status) })
    }

    emit('update:modelValue', false)
  } catch (error) {
    // Le dialogue reste ouvert : la saisie n'est pas perdue et peut être renvoyée
    logger.error('Erreur lors de la sauvegarde', error)
    showError('Enregistrement impossible', "La tâche n'a pas été enregistrée.")
  }
}
</script>
