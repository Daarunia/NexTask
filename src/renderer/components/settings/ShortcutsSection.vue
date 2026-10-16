<template>
  <SettingsSection
    :title="t('settings.shortcuts.title')"
    :description="t('settings.shortcuts.description')"
    testId="settings-shortcuts"
  >
    <dl class="flex flex-col">
      <div v-for="shortcut in SHORTCUTS" :key="shortcut.id" data-testid="shortcut-row" class="shortcut-row">
        <dt class="flex flex-wrap items-center gap-1">
          <template v-for="(combo, index) in shortcut.combos" :key="index">
            <span v-if="index" class="shortcut-muted" aria-hidden="true">·</span>
            <span class="inline-flex items-center gap-0.5">
              <kbd v-for="key in combo" :key="key" class="shortcut-key">{{ keyLabel(key) }}</kbd>
            </span>
          </template>
        </dt>
        <dd class="text-sm">{{ t(`settings.shortcuts.items.${shortcut.id}`) }}</dd>
      </div>
    </dl>
  </SettingsSection>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsSection from './SettingsSection.vue'

/**
 * Aide-mémoire des raccourcis clavier de l'app, dans les Paramètres. Les
 * touches nommées (Entrée, Maj…) sont traduites, les autres affichées telles
 * quelles. Le raccourci global de l'ajout rapide a sa propre ligne de réglage.
 */

// Touches dont le nom dépend de la langue
const NAMED_KEYS = ['enter', 'shift', 'del', 'esc', 'home', 'end'] as const
type NamedKey = (typeof NAMED_KEYS)[number]

// Les quatre flèches, montrées comme une seule touche
const ARROWS = '↑ ↓ ← →'

// Chaque raccourci : une ou plusieurs combinaisons, chacune une suite de touches
const SHORTCUTS = [
  { id: 'search', combos: [['Ctrl', 'F']] },
  { id: 'newTask', combos: [['N']] },
  { id: 'openCard', combos: [['enter']] },
  { id: 'navigate', combos: [[ARROWS], ['home'], ['end']] },
  { id: 'moveCard', combos: [['Alt', ARROWS]] },
  { id: 'cardMenu', combos: [['shift', 'F10']] },
  { id: 'archive', combos: [['del']] },
  {
    id: 'save',
    combos: [
      ['Ctrl', 'S'],
      ['Ctrl', 'enter'],
    ],
  },
  { id: 'saveAndNew', combos: [['Ctrl', 'shift', 'enter']] },
  { id: 'undo', combos: [['Ctrl', 'Z']] },
  { id: 'close', combos: [['esc']] },
] as const

const { t } = useI18n()

/**
 * Libellé d'une touche, traduit pour les touches nommées.
 * @param key Touche
 */
function keyLabel(key: string): string {
  return NAMED_KEYS.includes(key as NamedKey) ? t(`settings.shortcuts.keys.${key}`) : key
}
</script>

<style scoped>
@reference "tailwindcss";

.shortcut-row {
  @apply grid items-center gap-4 py-2;
  grid-template-columns: minmax(0, 14rem) 1fr;
}

.shortcut-row + .shortcut-row {
  border-top: 1px solid var(--p-content-border-color);
}

.shortcut-key {
  @apply rounded px-1.5 text-xs;
  font-family: inherit;
  line-height: 1.5rem;
  min-width: 1.5rem;
  text-align: center;
  border: 1px solid var(--p-content-border-color);
  border-bottom-width: 2px;
  background-color: var(--p-surface-100);
}

.app-dark .shortcut-key {
  background-color: var(--p-surface-800);
}

.shortcut-muted {
  color: var(--p-text-muted-color);
}
</style>
