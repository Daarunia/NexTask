<template>
  <div data-testid="settings-versions" class="flex flex-col gap-3">
    <!-- Versions proposées, dans l'ordre d'ajout -->
    <ul class="flex flex-col gap-1">
      <li
        v-for="version in settings.taskVersions"
        :key="version"
        data-testid="settings-version"
        :data-version="version"
        class="version-item"
      >
        <span class="flex-1 truncate">{{ version }}</span>

        <span
          v-if="version === settings.defaultTaskVersion"
          data-testid="settings-version-default"
          class="default-badge"
        >
          Par défaut
        </span>
        <Button
          v-else
          data-testid="btn-version-default"
          icon="pi pi-star"
          :aria-label="`Utiliser ${version} par défaut`"
          title="Utiliser par défaut"
          text
          rounded
          size="small"
          @click="setDefault(version)"
        />

        <!-- Au moins une version reste proposée -->
        <Button
          data-testid="btn-version-remove"
          icon="pi pi-trash"
          :aria-label="`Retirer ${version}`"
          :disabled="settings.taskVersions.length <= 1"
          text
          rounded
          size="small"
          severity="secondary"
          @click="remove(version)"
        />
      </li>
    </ul>

    <!-- Ajout d'une version -->
    <form class="flex gap-2" @submit.prevent="add">
      <InputText
        v-model="newVersion"
        data-testid="settings-version-input"
        aria-label="Nouvelle version"
        placeholder="Nouvelle version (ex. 1.6.0)"
        :maxlength="TASK_VERSION_MAX_LENGTH"
        :invalid="!!error"
        class="flex-1"
        @input="error = ''"
      />
      <Button type="submit" data-testid="btn-version-add" icon="pi pi-plus" label="Ajouter" />
    </form>
    <Message v-if="error" data-testid="settings-version-error" severity="error" size="small" variant="simple">
      {{ error }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { TASK_VERSION_MAX_LENGTH } from '../../../main/shared/settings.constants'
import { useSettingsStore } from '../../stores/Settings'
import { useErrorToast } from '../../utils/toast.helper'

const settings = useSettingsStore()
const showError = useErrorToast()

const newVersion = ref('')
const error = ref('')

/**
 * Ajoute la version saisie en fin de liste, après contrôle (non vide, unique).
 */
async function add() {
  const version = newVersion.value.trim()

  if (!version) {
    error.value = 'Saisis une version'
    return
  }
  if (settings.taskVersions.includes(version)) {
    error.value = 'Cette version est déjà proposée'
    return
  }

  try {
    await settings.set('taskVersions', [...settings.taskVersions, version])
    newVersion.value = ''
  } catch {
    // La saisie est conservée pour pouvoir réessayer
    showError('Version non ajoutée')
  }
}

/**
 * Retire une version. Si c'était la version par défaut, la dernière version
 * restante (la plus récente ajoutée) prend le relais.
 * @param version Version à retirer
 */
async function remove(version: string) {
  const remaining = settings.taskVersions.filter((v) => v !== version)
  if (remaining.length === 0) return

  try {
    // Défaut changé d'abord : il désigne toujours une version proposée
    if (version === settings.defaultTaskVersion) {
      await settings.set('defaultTaskVersion', remaining.at(-1) as string)
    }
    await settings.set('taskVersions', remaining)
  } catch {
    showError('Version non retirée')
  }
}

/**
 * Choisit la version présélectionnée à la création d'une tâche.
 * @param version Nouvelle version par défaut
 */
async function setDefault(version: string) {
  try {
    await settings.set('defaultTaskVersion', version)
  } catch {
    showError('Version par défaut non enregistrée')
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.version-item {
  @apply flex items-center gap-2 rounded-md py-1 pl-3 pr-1;
  background-color: var(--p-surface-300);
}

.app-dark .version-item {
  background-color: var(--p-surface-800);
}

.default-badge {
  @apply rounded-full px-2 text-xs;
  background-color: var(--p-primary-100);
  color: var(--p-primary-700);
}

.app-dark .default-badge {
  background-color: color-mix(in srgb, var(--p-primary-400) 18%, transparent);
  color: var(--p-primary-400);
}
</style>
