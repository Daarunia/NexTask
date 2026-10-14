<template>
  <div data-testid="checklists-page" class="tpl-page">
    <!-- Volet gauche, liste des modèles -->
    <aside class="tpl-list">
      <div class="tpl-list-head">
        <h1 class="tpl-list-title">{{ t('checklists.title') }}</h1>
        <Button
          data-testid="btn-new-template"
          icon="pi pi-plus"
          class="tpl-new"
          :aria-label="t('checklists.newTemplate')"
          :title="t('checklists.newTemplate')"
          :disabled="status !== 'ready' || busy"
          text
          rounded
          @click="createTemplate"
        />
      </div>

      <TemplateList
        v-if="status === 'ready' && templates.length"
        v-model:search="search"
        :templates="templates"
        :selectedId="selected?.id ?? null"
        @select="select"
        @reorder="reorder"
      />
    </aside>

    <!-- Volet droit, modèle sélectionné ou état vide -->
    <div class="tpl-main">
      <template v-if="status === 'ready'">
        <div v-if="!templates.length" data-testid="checklists-empty" class="empty-pane">
          <div>
            <div class="empty-icon"><i class="pi pi-list-check" aria-hidden="true"></i></div>
            <h2 class="empty-title">{{ t('checklists.emptyTitle') }}</h2>
            <p class="empty-text">{{ t('checklists.emptyText') }}</p>
            <Button
              data-testid="btn-create-first-template"
              icon="pi pi-plus"
              :label="t('checklists.createFirst')"
              :disabled="busy"
              @click="createTemplate"
            />
          </div>
        </div>

        <!-- Recréé à chaque changement de modèle, son démontage enregistre le précédent -->
        <TemplateEditor
          v-else-if="selected"
          ref="editor"
          :key="selected.id"
          :template="selected"
          :autofocusName="focusNameOf === selected.id"
          @focused="focusNameOf = null"
          @duplicate="duplicateTemplate(selected)"
          @delete="(target) => askDelete(target, selected!)"
        />

        <div v-else data-testid="template-no-selection" class="empty-pane">
          <div>
            <h2 class="empty-title">{{ t('checklists.chooseTitle') }}</h2>
            <p class="empty-text">{{ t('checklists.chooseText') }}</p>
          </div>
        </div>
      </template>

      <div v-else-if="status === 'error'" data-testid="checklists-load-error" class="empty-pane">
        <div>
          <p class="empty-text">{{ t('checklists.loadFailedDetail') }}</p>
          <Button :label="t('common.retry')" icon="pi pi-refresh" @click="load" />
        </div>
      </div>

      <div v-else class="empty-pane">
        <ProgressSpinner />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import { useI18n } from 'vue-i18n'
import TemplateList from '../components/checklists/TemplateList.vue'
import TemplateEditor from '../components/checklists/TemplateEditor.vue'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import type { ChecklistTemplate } from '../types/checklistTemplate.types'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { duplicateName, templateKey } from '../../main/shared/checklistTemplate.helper'

/**
 * Page Checklists (`/checklists/:id?`), gestion des modèles de checklist en
 * deux volets (parcours P5). L'id du modèle sélectionné est dans l'URL, le
 * dialogue de tâche et le toast d'un nouveau modèle peuvent donc ouvrir
 * directement le bon. La sélection change par `router.replace`, l'historique
 * ne garde que la page.
 */

const logger = getLogger()
const store = useChecklistTemplateStore()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const showError = useErrorToast()
const { t } = useI18n()

const status = ref<'loading' | 'error' | 'ready'>('loading')
const busy = ref(false) // création, duplication ou suppression en cours
const search = ref('')
const editor = ref<InstanceType<typeof TemplateEditor> | null>(null)

// Modèle dont le nom doit recevoir le focus à l'ouverture (nouveau modèle)
const focusNameOf = ref<number | null>(null)

const templates = computed(() => store.getAllTemplates)

// Modèle désigné par l'URL, absent si l'id est inconnu (modèle supprimé, lien périmé)
const selected = computed(() => {
  const raw = route.params.id
  const id = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(id) ? store.getTemplateById(id) : undefined
})

/**
 * Chargement des modèles, depuis le cache s'il est encore valide
 */
async function load() {
  status.value = 'loading'
  try {
    await store.loadAllTemplates()
    status.value = 'ready'
  } catch (error) {
    logger.error('Erreur lors du chargement de la page Checklists :', error)
    status.value = 'error'
  }
}

onMounted(load)

/**
 * Sélectionne un modèle, ou aucun, en remplaçant l'URL
 * @param id Id du modèle, `null` pour aucun
 */
async function select(id: number | null) {
  if (id === (selected.value?.id ?? null)) return
  await router.replace(id === null ? { name: 'Checklists' } : { name: 'Checklists', params: { id: String(id) } })
}

/**
 * Crée un modèle « Nouveau modèle », numéroté si le nom est pris, le
 * sélectionne et place le curseur dans son nom
 */
async function createTemplate() {
  if (busy.value) return
  busy.value = true

  try {
    const taken = new Set(templates.value.map((template) => templateKey(template.name)))
    const created = await store.createTemplate(duplicateName(t('checklists.newName'), taken))
    search.value = ''
    focusNameOf.value = created.id
    await select(created.id)
  } catch {
    showError(t('checklists.createFailed'), t('checklists.createFailedDetail'))
  } finally {
    busy.value = false
  }
}

/**
 * Duplique un modèle, après l'envoi de ses modifications en attente, puis
 * sélectionne la copie
 * @param template Modèle copié
 */
async function duplicateTemplate(template: ChecklistTemplate) {
  if (busy.value) return
  busy.value = true

  try {
    await editor.value?.flush()
    const copy = await store.duplicateTemplate(template.id)
    search.value = ''
    await select(copy.id)
  } catch {
    showError(t('checklists.duplicateFailed'), t('checklists.duplicateFailedDetail'))
  } finally {
    busy.value = false
  }
}

/**
 * Demande confirmation avant de supprimer un modèle, dans une bulle ancrée
 * sur le bouton ⋯
 * @param target Bouton ⋯ de l'éditeur
 * @param template Modèle à supprimer
 */
function askDelete(target: HTMLElement | undefined, template: ChecklistTemplate) {
  confirm.require({
    target,
    message: t('checklists.deleteConfirm', { name: template.name }),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: t('common.cancel'),
      severity: 'secondary',
      outlined: true,
      'data-testid': 'btn-confirm-reject',
    },
    acceptProps: { label: t('common.delete'), severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: () => deleteTemplate(template),
  })
}

/**
 * Supprime un modèle puis sélectionne son voisin (le suivant, sinon le précédent)
 * @param template Modèle à supprimer
 */
async function deleteTemplate(template: ChecklistTemplate) {
  if (busy.value) return
  busy.value = true

  const list = templates.value
  const index = list.findIndex((item) => item.id === template.id)
  const neighbor = list[index + 1] ?? list[index - 1]

  try {
    // Plus rien à enregistrer sur un modèle qui disparaît
    editor.value?.discard()
    await store.deleteTemplate(template.id)
    await select(neighbor?.id ?? null)
  } catch {
    showError(t('checklists.deleteFailed'), t('checklists.deleteFailedDetail'))
  } finally {
    busy.value = false
  }
}

/**
 * Enregistre le nouvel ordre des modèles
 * @param orderedIds Ids de tous les modèles, dans le nouvel ordre
 */
async function reorder(orderedIds: number[]) {
  try {
    await store.reorderTemplates(orderedIds)
  } catch {
    showError(t('checklists.reorderFailed'))
  }
}

// Modifications en attente envoyées avant de quitter la page
onBeforeRouteLeave(async () => {
  await editor.value?.flush()
})
</script>

<style scoped>
@reference "tailwindcss";

.tpl-page {
  @apply grid h-full;
  grid-template-columns: 272px minmax(0, 1fr);
}

.tpl-list {
  @apply flex min-h-0 flex-col gap-2.5;
  padding: 18px 12px;
  border-right: 1px solid var(--p-content-border-color);
}

.tpl-list-head {
  @apply flex items-center justify-between px-1;
}

.tpl-list-title {
  @apply m-0 text-lg font-semibold;
  color: var(--p-text-color);
}

.tpl-new {
  width: 28px !important;
  height: 28px !important;
}

.tpl-main {
  @apply min-h-0 overflow-y-auto;
}

.empty-pane {
  @apply grid h-full place-items-center p-6 text-center;
  color: var(--p-text-muted-color);
}

.empty-icon {
  @apply mx-auto mb-3 grid size-12 place-items-center rounded-xl;
  background-color: var(--p-highlight-background);
  color: var(--p-primary-color);
}

.empty-icon .pi {
  font-size: 1.5rem;
}

.empty-title {
  @apply m-0 mb-1 text-[17px] font-bold;
  color: var(--p-text-color);
}

.empty-text {
  @apply mx-auto mt-0 mb-3.5;
  max-width: 34ch;
}
</style>
