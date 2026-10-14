<template>
  <!-- Échap géré ici : PrimeVue fermerait aussi le dialogue de tâche, ouvert dessous -->
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :show-header="false"
    :closeOnEscape="false"
    class="save-template-dialog"
    @after-hide="emit('closed')"
  >
    <form data-testid="save-template-dialog" class="flex flex-col gap-3.5 pt-4" @submit.prevent="create">
      <div class="-mt-2 flex items-center justify-between gap-2">
        <span class="dialog-heading">{{ t('checklist.saveAsTemplate') }}</span>
        <Button
          type="button"
          icon="pi pi-times"
          text
          rounded
          size="small"
          :aria-label="t('task.dialog.close')"
          @click="visible = false"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label :for="nameId" class="field-label">{{ t('checklists.nameLabel') }}</label>
        <InputText
          :id="nameId"
          ref="nameInput"
          v-model="name"
          data-testid="save-template-name"
          spellcheck="false"
          :maxlength="CHECKLIST_TEMPLATE_NAME_MAX_LENGTH"
          :invalid="!!nameError"
          :aria-describedby="nameError ? errorId : hintId"
          @input="nameError = ''"
        />
        <Message
          v-if="nameError"
          :id="errorId"
          data-testid="save-template-name-error"
          severity="error"
          size="small"
          variant="simple"
        >
          {{ nameError }}
        </Message>
        <span :id="hintId" class="save-hint" data-testid="save-template-hint">
          {{ t('checklist.saveHint', { count: texts.length }, texts.length) }}
        </span>
      </div>

      <div class="flex items-center gap-2 pt-0.5">
        <span class="flex-1"></span>
        <Button
          type="button"
          :label="t('common.cancel')"
          data-testid="btn-save-template-cancel"
          severity="secondary"
          text
          @click="visible = false"
        />
        <Button
          type="submit"
          :label="t('checklist.createTemplateConfirm')"
          data-testid="btn-save-template-confirm"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useI18n } from 'vue-i18n'
import type { ChecklistEditorItem } from './ChecklistItemsEditor.vue'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import { httpStatus } from '../utils/api.helper'
import { toTemplateItems } from '../utils/checklist.helper'
import { getLogger } from '../utils/logger'
import { useActionToast, useErrorToast } from '../utils/toast.helper'
import { duplicateName, templateKey } from '../../main/shared/checklistTemplate.helper'
import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } from '../../main/shared/checklist.constants'

/**
 * « Enregistrer comme modèle » (parcours P6). Demande un nom, prérempli avec
 * le titre de la tâche et numéroté s'il est déjà pris, puis crée tout de suite
 * le modèle avec les textes des points, sans leur état coché, que la tâche
 * soit enregistrée ensuite ou non.
 *
 * Le toast de confirmation propose « Ouvrir » vers la page Checklists tant que
 * le dialogue de tâche n'a aucune modification en cours, quitter le tableau ne
 * fait ainsi jamais perdre une saisie.
 */

const props = defineProps<{
  items: ChecklistEditorItem[] // points de la checklist, tels que saisis
  taskTitle: string // titre de la tâche, nom proposé
  hasPendingChanges: () => boolean // modifications non enregistrées du dialogue de tâche
}>()

const emit = defineEmits<{
  closed: [] // dialogue refermé, animation comprise
}>()

const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()
const logger = getLogger()
const router = useRouter()
const store = useChecklistTemplateStore()
const showError = useErrorToast()
const showDone = useActionToast()
const nameId = useId()
const errorId = useId()
const hintId = useId()

const nameInput = ref<{ $el: HTMLInputElement } | null>(null)
const name = ref('')
const nameError = ref('')
const saving = ref(false)

// Textes enregistrés dans le modèle, nettoyés et sans les points vides
const texts = computed(() => toTemplateItems(props.items))

/**
 * Clés des noms de modèles déjà pris
 */
function takenKeys(): Set<string> {
  return new Set(store.getAllTemplates.map((template) => templateKey(template.name)))
}

/**
 * Nom proposé à l'ouverture, le titre de la tâche numéroté s'il est pris
 */
async function proposeName() {
  try {
    await store.loadAllTemplates()
  } catch (error) {
    // Le serveur refusera un nom pris, l'erreur s'affichera alors sous le champ
    logger.warn('Modèles non chargés, nom proposé sans contrôle :', error)
  }
  const base = props.taskTitle.trim().slice(0, CHECKLIST_TEMPLATE_NAME_MAX_LENGTH) || t('checklists.newName')
  name.value = duplicateName(base, takenKeys())
  nameError.value = ''

  await nextTick()
  nameInput.value?.$el.focus()
  nameInput.value?.$el.select()
}

/**
 * Motif de refus du nom, vide s'il est valable
 * @param clean Nom nettoyé
 */
function nameProblem(clean: string): string {
  if (!clean) return t('checklists.nameRequired')
  return takenKeys().has(templateKey(clean)) ? t('checklists.nameTaken') : ''
}

/**
 * Crée le modèle, referme le dialogue puis confirme par un toast
 */
async function create() {
  if (saving.value) return
  const clean = name.value.trim()
  nameError.value = nameProblem(clean)
  if (nameError.value) return

  saving.value = true
  try {
    const template = await store.createTemplate(clean, texts.value)
    visible.value = false
    showDone(t('checklist.templateCreated'), t('checklist.templateCreatedDetail', { name: template.name }), {
      label: t('checklist.open'),
      run: () => router.push({ name: 'Checklists', params: { id: template.id } }),
      available: () => !props.hasPendingChanges(),
    })
  } catch (error) {
    if (httpStatus(error) === 409) {
      nameError.value = t('checklists.nameTaken')
    } else {
      logger.error('Erreur lors de la création du modèle depuis la tâche :', error)
      showError(t('checklists.createFailed'), t('checklists.createFailedDetail'))
    }
  } finally {
    saving.value = false
  }
}

/**
 * Échap ferme ce dialogue seul. Écouté en capture sur la fenêtre, avant le
 * dialogue de tâche qui se fermerait avec lui.
 * @param event Touche pressée
 */
function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  visible.value = false
}

watch(
  visible,
  (open) => {
    if (open) {
      globalThis.addEventListener('keydown', onEscape, true)
      void proposeName()
    } else {
      globalThis.removeEventListener('keydown', onEscape, true)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => globalThis.removeEventListener('keydown', onEscape, true))
</script>

<style scoped>
.dialog-heading {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.save-hint {
  font-size: 12.5px;
  color: var(--p-text-muted-color);
}
</style>

<style>
/* Largeur de la maquette, dans la limite de l'écran */
.save-template-dialog.p-dialog {
  width: 420px;
  max-width: calc(100vw - 2rem);
}
</style>
