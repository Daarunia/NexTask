<template>
  <div class="flex flex-col gap-2 w-full">
    <div class="flex items-center justify-between gap-2">
      <span class="font-medium">{{ label }}</span>
      <div class="markdown-modes" role="group" :aria-label="`Mode d'affichage du champ ${label}`">
        <Button
          type="button"
          label="Écrire"
          size="small"
          :text="mode !== 'edit'"
          :severity="mode === 'edit' ? undefined : 'secondary'"
          :aria-pressed="mode === 'edit'"
          :data-testid="`${testId}-edit-btn`"
          @click="showEditor"
        />
        <Button
          type="button"
          label="Aperçu"
          size="small"
          :text="mode !== 'preview'"
          :severity="mode === 'preview' ? undefined : 'secondary'"
          :aria-pressed="mode === 'preview'"
          :data-testid="`${testId}-preview-btn`"
          @click="mode = 'preview'"
        />
      </div>
    </div>

    <!-- Masqué plutôt que retiré : l'historique d'annulation survit au passage par l'aperçu -->
    <MdEditor
      v-show="mode === 'edit'"
      :id="`${id}-editor`"
      ref="editorRef"
      :modelValue="modelValue"
      :theme="theme"
      :language="MARKDOWN_EDITOR_LANGUAGE"
      :toolbars="MARKDOWN_EDITOR_TOOLBARS"
      :footers="[]"
      :preview="false"
      :placeholder="placeholder"
      :tabWidth="2"
      noHighlight
      noKatex
      noMermaid
      noEcharts
      noPrettier
      noUploadImg
      class="markdown-editor"
      :data-testid="`${testId}-editor`"
      @update:modelValue="(value: string) => emit('update:modelValue', value)"
    />

    <template v-if="mode === 'preview'">
      <MdPreview
        v-if="modelValue.trim()"
        :id="`${id}-preview`"
        :modelValue="modelValue"
        :theme="theme"
        :language="MARKDOWN_EDITOR_LANGUAGE"
        previewTheme="github"
        :showCodeRowNumber="false"
        :codeFoldable="false"
        noHighlight
        noKatex
        noMermaid
        noEcharts
        noImgZoomIn
        class="markdown-preview"
        :data-testid="`${testId}-preview`"
      />
      <p v-else class="markdown-preview markdown-empty" :data-testid="`${testId}-preview`">Rien à afficher</p>
    </template>
  </div>
</template>

<script lang="ts">
import { setupMarkdownEditor } from '../utils/markdownEditor.helper'

// Une seule fois, au chargement du composant (chargé à la demande par TaskDialog)
setupMarkdownEditor()
</script>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Button from 'primevue/button'
import { MdEditor, MdPreview, type ExposeParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useSettingsStore } from '../stores/Settings'
import { MARKDOWN_EDITOR_LANGUAGE, MARKDOWN_EDITOR_TOOLBARS } from '../utils/markdownEditor.helper'

/**
 * Champ Markdown d'un formulaire, avec un mode écriture (md-editor-v3 : barre
 * d'outils, raccourcis, suite des listes) et un mode aperçu.
 *
 * Le parent le relie au formulaire par un <FormField> (`modelValue` et
 * `update:modelValue`), comme le sélecteur de tags.
 */
const props = defineProps<{
  modelValue: string
  /** Préfixe des id de l'éditeur et de l'aperçu */
  id: string
  label: string
  placeholder?: string
  /** Préfixe des data-testid (`-editor`, `-preview`, `-edit-btn`, `-preview-btn`) */
  testId: string
  /** Ouvre le champ en aperçu plutôt qu'en écriture */
  startInPreview?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const settings = useSettingsStore()
const theme = computed(() => (settings.isDark ? 'dark' : 'light'))

const mode = ref<'edit' | 'preview'>(props.startInPreview ? 'preview' : 'edit')

const editorRef = ref<ExposeParam | null>(null)

/** Repasse en écriture, curseur placé à la fin du texte. */
async function showEditor() {
  mode.value = 'edit'
  await nextTick()
  editorRef.value?.focus('end')
}
</script>

<style scoped>
@reference "tailwindcss";

.markdown-modes {
  @apply flex gap-1;
}

/* Couleurs de md-editor accordées à celles des champs PrimeVue, en clair comme en sombre */
.markdown-editor,
.markdown-preview {
  --md-color: var(--p-text-color);
  --md-hover-color: var(--p-text-color);
  --md-bk-color: var(--p-form-field-background);
  --md-bk-color-outstand: var(--p-content-hover-background);
  --md-bk-hover-color: var(--p-content-hover-background);
  --md-border-color: var(--p-form-field-border-color);
  --md-border-hover-color: var(--p-form-field-hover-border-color);
  --md-border-active-color: var(--p-form-field-focus-border-color);
}

/* Variables du rendu, redéfinies par md-editor sur .md-editor-preview */
.markdown-editor.md-editor :deep(.md-editor-preview),
.markdown-preview.md-editor :deep(.md-editor-preview) {
  --md-theme-color: var(--p-text-color);
  --md-theme-bg-color: var(--p-form-field-background);
  --md-theme-border-color: var(--p-content-border-color);
  --md-theme-link-color: var(--p-primary-color);
  --md-theme-link-hover-color: var(--p-primary-hover-color);
}

.markdown-editor {
  @apply rounded-md;
  height: 16rem;
  border-color: var(--p-form-field-border-color);
}

/* Barre d'outils sur plusieurs lignes si la place manque, plutôt que le
   défilement horizontal sans barre de md-editor qui cache des boutons */
.markdown-editor :deep(.md-editor-toolbar),
.markdown-editor :deep(.md-editor-toolbar-left),
.markdown-editor :deep(.md-editor-toolbar-right) {
  flex-wrap: wrap;
}

.markdown-editor:focus-within {
  border-color: var(--p-form-field-focus-border-color);
}

.markdown-preview {
  @apply rounded-md px-3 py-2 overflow-auto;
  min-height: 6.5rem;
  max-height: 24rem;
  background-color: var(--p-form-field-background);
  border: 1px solid var(--p-form-field-border-color);
}

.markdown-preview :deep(.md-editor-preview-wrapper) {
  @apply p-0;
}

/* Le thème github est fait pour une page de documentation : dans un champ de
   formulaire, titres resserrés, sans trait sous h1 et h2, et jamais plus petits
   que le texte */
.markdown-preview.md-editor :deep(.md-editor-preview > :first-child) {
  margin-block-start: 0;
}

.markdown-preview.md-editor :deep(.md-editor-preview > :last-child) {
  margin-block-end: 0;
}

.markdown-preview.md-editor :deep(.md-editor-preview :is(h1, h2, h3, h4, h5, h6)) {
  margin-block: 1em 0.5em;
  padding-block-end: 0;
  border-block-end: none;
  line-height: 1.3;
}

.markdown-preview.md-editor :deep(.md-editor-preview h1) {
  font-size: 1.5em;
}

.markdown-preview.md-editor :deep(.md-editor-preview h2) {
  font-size: 1.3em;
}

.markdown-preview.md-editor :deep(.md-editor-preview h3) {
  font-size: 1.15em;
}

.markdown-preview.md-editor :deep(.md-editor-preview :is(h4, h5, h6)) {
  font-size: 1em;
}

.markdown-preview.md-editor :deep(.md-editor-preview h6) {
  color: var(--p-text-muted-color);
}

.markdown-empty {
  color: var(--p-form-field-placeholder-color);
}
</style>
