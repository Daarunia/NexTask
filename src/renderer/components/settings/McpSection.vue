<template>
  <SettingsSection :title="t('settings.mcp.title')" :description="t('settings.mcp.description')" testId="settings-mcp">
    <SettingsRow :label="t('settings.mcp.enabled')" :description="statusLabel" testId="settings-row-mcp-enabled">
      <ToggleSwitch v-model="enabled" data-testid="settings-mcp-toggle" :ariaLabel="t('settings.mcp.enabled')" />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.mcp.port')"
      :description="t('settings.mcp.portDescription')"
      testId="settings-row-mcp-port"
    >
      <InputNumber
        v-model="port"
        data-testid="settings-mcp-port"
        :min="MCP_PORT_MIN"
        :max="MCP_PORT_MAX"
        :useGrouping="false"
        inputClass="w-28"
        :aria-label="t('settings.mcp.port')"
        @blur="savePort"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.mcp.token')"
      :description="t('settings.mcp.tokenDescription')"
      testId="settings-row-mcp-token"
    >
      <div class="flex flex-wrap items-center justify-end gap-2">
        <code data-testid="settings-mcp-token" class="token">{{ token ?? MASKED_TOKEN }}</code>
        <Button
          data-testid="btn-mcp-show-token"
          :label="token ? t('settings.mcp.hideToken') : t('settings.mcp.showToken')"
          :icon="token ? 'pi pi-eye-slash' : 'pi pi-eye'"
          severity="secondary"
          outlined
          size="small"
          @click="toggleToken"
        />
        <Button
          data-testid="btn-mcp-regenerate"
          :label="t('settings.mcp.regenerate')"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          size="small"
          @click="askRegenerate"
        />
      </div>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.mcp.connect')"
      :description="t('settings.mcp.connectDescription')"
      testId="settings-row-mcp-connect"
    >
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          data-testid="btn-mcp-copy-claude-code"
          :label="t('settings.mcp.copyClaudeCode')"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          @click="copy('claudeCode')"
        />
        <Button
          data-testid="btn-mcp-copy-json"
          :label="t('settings.mcp.copyJson')"
          icon="pi pi-copy"
          severity="secondary"
          outlined
          size="small"
          @click="copy('json')"
        />
      </div>
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import { useI18n } from 'vue-i18n'
import { MCP_PORT_MAX, MCP_PORT_MIN } from '@core/shared/settings.constants'
import type { McpCopyKind, McpStatus } from '@core/shared/mcp.constants'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import { useSettingsStore } from '../../stores/Settings'
import { useDangerConfirm } from '../../utils/confirm.helper'
import { useErrorToast, useSuccessToast } from '../../utils/toast.helper'
import { getLogger } from '../../utils/logger'

/**
 * Accès MCP des assistants IA (Claude Code…), dans les Paramètres : activation,
 * port, jeton, et configuration à copier dans l'assistant. Le serveur tourne
 * dans le main (cf. system/mcp.ts) ; son état est relu après chaque changement.
 */

// Jeton masqué tant qu'il n'est pas demandé
const MASKED_TOKEN = '••••••••••••••••'

const settings = useSettingsStore()
const confirmDanger = useDangerConfirm()
const showError = useErrorToast()
const showSuccess = useSuccessToast()
const logger = getLogger()
const { t } = useI18n()

const status = ref<McpStatus | null>(null)
const token = ref<string | null>(null)
const port = ref<number | null>(settings.mcpPort)

const enabled = computed({
  get: () => settings.mcpEnabled,
  set: (value: boolean) => {
    settings
      .set('mcpEnabled', value)
      .then(refreshStatus)
      .catch(() => showError(t('settings.notSaved')))
  },
})

/** État affiché sous l'interrupteur : adresse d'écoute, ou motif de l'arrêt. */
const statusLabel = computed(() => {
  const current = status.value
  if (!current || current.state === 'disabled') return t('settings.mcp.status.disabled')
  if (current.state === 'listening') return t('settings.mcp.status.listening', { url: current.url })
  if (current.state === 'portInUse') return t('settings.mcp.status.portInUse', { port: current.port })
  return t('settings.mcp.status.error')
})

/** Relit l'état du serveur, une fois la bascule du main terminée. */
async function refreshStatus() {
  try {
    status.value = await globalThis.mcp.getStatus()
  } catch (error) {
    logger.warn("État de l'accès MCP illisible :", error)
  }
}

/** Enregistre le port saisi, une fois dans les bornes ; sinon revient à l'actuel. */
function savePort() {
  const next = port.value
  if (next === null || !Number.isInteger(next) || next < MCP_PORT_MIN || next > MCP_PORT_MAX) {
    port.value = settings.mcpPort
    return
  }
  if (next === settings.mcpPort) return
  settings
    .set('mcpPort', next)
    .then(refreshStatus)
    .catch(() => showError(t('settings.notSaved')))
}

/** Affiche ou masque le jeton. */
async function toggleToken() {
  if (token.value) {
    token.value = null
    return
  }
  try {
    token.value = await globalThis.mcp.getToken()
  } catch (error) {
    logger.error('Jeton MCP illisible :', error)
    showError(t('settings.mcp.tokenFailed'))
  }
}

/**
 * Demande confirmation avant de changer le jeton : les assistants configurés
 * devront l'être à nouveau.
 * @param event Clic sur le bouton
 */
function askRegenerate(event: MouseEvent) {
  confirmDanger({
    target: event.currentTarget as HTMLElement,
    message: t('settings.mcp.regenerateConfirm'),
    acceptLabel: t('settings.mcp.regenerate'),
    accept: regenerate,
  })
}

/** Nouveau jeton, montré s'il l'était déjà. */
async function regenerate() {
  try {
    status.value = await globalThis.mcp.regenerateToken()
    if (token.value) token.value = await globalThis.mcp.getToken()
    showSuccess(t('settings.mcp.regenerated'))
  } catch (error) {
    logger.error('Nouveau jeton MCP impossible :', error)
    showError(t('settings.mcp.tokenFailed'))
  }
}

/**
 * Copie la configuration de l'assistant, jeton compris.
 * @param kind Commande Claude Code ou JSON
 */
async function copy(kind: McpCopyKind) {
  try {
    await globalThis.mcp.copyConfig(kind)
    showSuccess(t('settings.mcp.copied'))
  } catch (error) {
    logger.error('Copie de la configuration MCP impossible :', error)
    showError(t('settings.mcp.copyFailed'))
  }
}

// Port changé ailleurs (remise à zéro des paramètres) : champ et état suivent
watch(
  () => settings.mcpPort,
  (value) => {
    port.value = value
  },
)
watch(() => settings.mcpEnabled, refreshStatus)

onMounted(refreshStatus)
</script>

<style scoped>
.token {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  word-break: break-all;
  max-width: 22rem;
  color: var(--p-text-muted-color);
}
</style>
