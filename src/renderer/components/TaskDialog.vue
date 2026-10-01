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
import { ref, watch, PropType } from 'vue'
import { Form, FormField, type FormSubmitEvent } from '@primevue/forms'
import { zodResolver } from '@primevue/forms/resolvers/zod'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import TagSelect from './TagSelect.vue'
import { Task, TaskInput } from '../types/task.types'
import { TagSelection } from '../types/tag.types'
import { taskFormSchema, TaskFormValues } from '../schemas/task.schema'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'

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

const DEFAULT_VERSION = '1.5.0'

// State
const visible = ref(props.modelValue)
const stageId = ref(props.stageId)
const position = ref(props.position)

// Valeurs de départ du formulaire, relues par <Form> à chaque ouverture
const initialValues = ref<TaskFormValues>(defaultValues())

const versions = ref([
  { label: '1.4.4', value: '1.4.4' },
  { label: '1.4.5', value: '1.4.5' },
  { label: '1.5.0', value: '1.5.0' },
])

const resolver = zodResolver(taskFormSchema)

// Logger & Store
const logger = getLogger()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const showError = useErrorToast()

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
        initialValues.value = {
          title: props.editTask.title,
          description: props.editTask.description,
          version: props.editTask.version,
          // La date arrive en chaîne ISO via HTTP, on la reconvertit en Date pour le DatePicker
          startDate: props.editTask.startDate ? new Date(props.editTask.startDate) : null,
          tags: toTagSelection(props.editTask),
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
    version: DEFAULT_VERSION,
    startDate: null,
    tags: props.defaultTags.map((tag) => ({ ...tag })),
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

    let savedTask: Task | undefined

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

    emit('update:modelValue', false)
  } catch (error) {
    // Le dialogue reste ouvert : la saisie n'est pas perdue et peut être renvoyée
    logger.error('Erreur lors de la sauvegarde', error)
    showError('Enregistrement impossible', "La tâche n'a pas été enregistrée.")
  }
}
</script>
