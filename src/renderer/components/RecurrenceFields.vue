<template>
  <div class="flex flex-col gap-2 w-full" data-testid="recurrence-fields">
    <div class="flex items-center justify-between gap-2">
      <label for="recurrence" class="field-label">
        <i class="pi pi-replay" aria-hidden="true"></i>{{ t('recurrence.fields.repeat') }}
      </label>
      <!-- Raccourci vers « Ne pas répéter » : la série s'arrête à l'enregistrement -->
      <Button
        v-if="seriesLive && modelValue.preset !== 'none'"
        data-testid="recurrence-stop"
        :label="t('recurrence.fields.stopSeries')"
        size="small"
        link
        class="p-0!"
        @click="update({ preset: 'none' })"
      />
    </div>

    <Select
      inputId="recurrence"
      data-testid="recurrence-select"
      :modelValue="modelValue.preset"
      :options="presetOptions"
      optionLabel="label"
      optionValue="value"
      @update:modelValue="onPresetChange"
    />

    <!-- Résumé en clair et prochaine date -->
    <p v-if="summary" data-testid="recurrence-summary" class="recurrence-hint">{{ summary }}</p>
    <p v-if="nextRun" data-testid="recurrence-next" class="recurrence-hint">
      {{ t('recurrence.next', { date: formatNextRun(nextRun) }) }}
    </p>
    <!-- Après archivage : pas de date tant que la tâche est au tableau -->
    <p v-else-if="waitingForArchive" data-testid="recurrence-next" class="recurrence-hint">
      {{ t('recurrence.next', { date: waitingForArchiveLabel().toLowerCase() }) }}
    </p>
    <p v-if="seriesPaused" data-testid="recurrence-paused-hint" class="recurrence-hint">
      {{ t('recurrence.fields.pausedHint') }}
    </p>
    <p v-if="monthEndHint" data-testid="recurrence-month-end-hint" class="recurrence-hint">{{ monthEndHint }}</p>
    <p v-if="seriesLive && modelValue.preset === 'none'" data-testid="recurrence-stop-hint" class="recurrence-hint">
      {{ t('recurrence.fields.stopHint') }}
    </p>

    <!-- Règle personnalisée -->
    <div v-if="modelValue.preset === 'custom'" data-testid="recurrence-custom" class="recurrence-custom">
      <!-- Point de départ des dates : calendrier, ou archivage de l'occurrence précédente -->
      <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="recurrence-anchor-label">
        <span id="recurrence-anchor-label">{{ t('recurrence.fields.repeat') }}</span>
        <div v-for="option in anchorOptions" :key="option.value" class="flex items-center gap-2">
          <RadioButton
            :inputId="`recurrence-anchor-${option.value}`"
            :data-testid="`recurrence-anchor-${option.value}`"
            :value="option.value"
            :modelValue="modelValue.anchor"
            @update:modelValue="onAnchorChange"
          />
          <label :for="`recurrence-anchor-${option.value}`">{{ option.label }}</label>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="calendar">{{
          t(modelValue.frequency === 'weekly' ? 'recurrence.fields.everyFeminine' : 'recurrence.fields.everyMasculine')
        }}</span>
        <InputNumber
          data-testid="recurrence-interval"
          :modelValue="modelValue.interval"
          :min="1"
          :max="RECURRENCE_INTERVAL_MAX"
          :useGrouping="false"
          inputClass="w-16"
          :aria-label="t('recurrence.fields.interval')"
          @update:modelValue="(interval: number | null) => update({ interval })"
        />
        <Select
          data-testid="recurrence-unit"
          :modelValue="modelValue.frequency"
          :options="unitOptions"
          optionLabel="label"
          optionValue="value"
          :aria-label="t('recurrence.fields.unit')"
          class="flex-1"
          @update:modelValue="onUnitChange"
        />
        <span v-if="!calendar" data-testid="recurrence-after-archive">{{ t('recurrence.fields.afterArchive') }}</span>
      </div>

      <!-- Jours de la semaine, hebdomadaire selon le calendrier uniquement -->
      <fieldset
        v-if="calendar && modelValue.frequency === 'weekly'"
        class="flex gap-1"
        :aria-label="t('recurrence.fields.weekdays')"
      >
        <Button
          v-for="day in WEEKDAYS"
          :key="day"
          data-testid="recurrence-weekday"
          :data-weekday="day"
          :label="weekdayLetter(day)"
          :aria-label="weekdayName(day)"
          :aria-pressed="modelValue.weekdays.includes(day)"
          :outlined="!modelValue.weekdays.includes(day)"
          size="small"
          rounded
          class="weekday-button"
          @click="toggleWeekday(day)"
        />
      </fieldset>

      <!-- Jour du mois, mensuel selon le calendrier uniquement : libellés tirés de la date de début -->
      <div
        v-if="calendar && modelValue.frequency === 'monthly'"
        class="flex flex-col gap-2"
        role="radiogroup"
        :aria-label="t('recurrence.fields.dayOfMonth')"
      >
        <div v-for="option in monthlyOptions" :key="option.value" class="flex items-center gap-2">
          <RadioButton
            :inputId="`recurrence-monthly-${option.value}`"
            data-testid="recurrence-monthly-mode"
            :data-mode="option.value"
            :value="option.value"
            :modelValue="modelValue.monthlyMode"
            @update:modelValue="onMonthlyModeChange"
          />
          <label :for="`recurrence-monthly-${option.value}`" data-testid="recurrence-monthly-label">
            {{ option.label }}
          </label>
        </div>
      </div>

      <!-- Fin de la série -->
      <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="recurrence-end-label">
        <span id="recurrence-end-label">{{ t('recurrence.fields.ends') }}</span>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-never"
            data-testid="recurrence-end-never"
            value="never"
            :modelValue="modelValue.endType"
            @update:modelValue="onEndTypeChange"
          />
          <label for="recurrence-end-never">{{ t('recurrence.fields.never') }}</label>
        </div>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-on-date"
            data-testid="recurrence-end-on-date"
            value="onDate"
            :modelValue="modelValue.endType"
            @update:modelValue="onEndTypeChange"
          />
          <label for="recurrence-end-on-date">{{ t('recurrence.fields.on') }}</label>
          <DatePicker
            data-testid="recurrence-end-date"
            :modelValue="modelValue.endsOn"
            :placeholder="t('recurrence.fields.endDate')"
            @update:modelValue="onEndDateChange"
          />
        </div>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-after-count"
            data-testid="recurrence-end-after-count"
            value="afterCount"
            :modelValue="modelValue.endType"
            @update:modelValue="onEndTypeChange"
          />
          <label for="recurrence-end-after-count">{{ t('recurrence.fields.after') }}</label>
          <InputNumber
            data-testid="recurrence-end-count"
            :modelValue="modelValue.maxCount"
            :min="1"
            :max="RECURRENCE_COUNT_MAX"
            :useGrouping="false"
            inputClass="w-16"
            :aria-label="t('recurrence.fields.occurrenceCount')"
            @update:modelValue="(maxCount: number | null) => update({ maxCount, endType: 'afterCount' })"
          />
          <span>{{ t('recurrence.fields.occurrences') }}</span>
        </div>
      </div>

      <!-- Création anticipée : la tâche arrive au tableau avant sa date, son rappel reste à sa date -->
      <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="recurrence-lead-label">
        <span id="recurrence-lead-label">{{ t('recurrence.fields.createTask') }}</span>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-lead-same-day"
            data-testid="recurrence-lead-same-day"
            :value="false"
            :modelValue="modelValue.createEarly"
            @update:modelValue="(createEarly: boolean) => update({ createEarly })"
          />
          <label for="recurrence-lead-same-day">{{ t('recurrence.fields.sameDay') }}</label>
        </div>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-lead-before"
            data-testid="recurrence-lead-before"
            :value="true"
            :modelValue="modelValue.createEarly"
            @update:modelValue="(createEarly: boolean) => update({ createEarly })"
          />
          <InputNumber
            data-testid="recurrence-lead-days"
            :modelValue="modelValue.leadDays"
            :min="1"
            :max="RECURRENCE_LEAD_DAYS_MAX"
            :useGrouping="false"
            inputClass="w-16"
            :aria-label="t('recurrence.fields.leadDays')"
            @update:modelValue="(leadDays: number | null) => update({ leadDays, createEarly: true })"
          />
          <label for="recurrence-lead-before">{{
            t('recurrence.fields.daysBefore', modelValue.leadDays === 1 ? 1 : 2)
          }}</label>
        </div>
        <p v-if="modelValue.createEarly" class="recurrence-hint">
          {{ t('recurrence.fields.leadHint') }}
        </p>
      </div>

      <!-- « Ne pas empiler » : sans objet après archivage (une seule occurrence à la fois) -->
      <template v-if="calendar">
        <div class="flex items-center gap-2">
          <Checkbox
            inputId="recurrence-skip"
            data-testid="recurrence-skip"
            binary
            :modelValue="modelValue.skipIfPending"
            @update:modelValue="(skipIfPending: boolean) => update({ skipIfPending })"
          />
          <label for="recurrence-skip">{{ t('recurrence.fields.skipIfPending') }}</label>
        </div>
        <p class="recurrence-hint">{{ t('recurrence.fields.skipHint') }}</p>
      </template>
      <p v-else class="recurrence-hint">
        {{ t('recurrence.fields.completionHint') }}
      </p>
    </div>

    <Message v-if="error" severity="error" size="small" variant="simple" data-testid="recurrence-error">
      {{ error }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import RadioButton from 'primevue/radiobutton'
import Checkbox from 'primevue/checkbox'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_LEAD_DAYS_MAX,
  type MonthlyMode,
  type RecurrenceAnchor,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type RecurrenceSummary,
} from '../../main/shared/recurrence.constants'
import { isoWeekday } from '../../main/shared/recurrence.helper'
import type { RecurrenceFormValue, RecurrencePreset } from '../schemas/task.schema'
import {
  WEEKDAYS,
  describeRecurrence,
  describeRecurrenceInput,
  formatNextRun,
  isWaitingForArchive,
  monthlyModeOptions,
  previewNextRun,
  recurrencePresetOptions,
  sameRecurrenceInput,
  summaryToInput,
  toCustomValue,
  toRecurrenceInput,
  waitingForArchiveLabel,
  weekdayLetter,
  weekdayName,
} from '../utils/recurrence.helper'
import { useI18n } from 'vue-i18n'

/**
 * Champ « Répéter » du formulaire de tâche (cf. TaskDialog) : préréglages
 * calculés depuis la date de début (selon le calendrier), bloc
 * « Personnaliser… » (calendrier ou après l'archivage de la précédente),
 * résumé en clair de la règle et prochaine date.
 *
 * La valeur est portée par le formulaire parent (FormField `recurrence`) ;
 * la date de début aussi, d'où l'événement `need-start-date` quand une
 * répétition est choisie sans date.
 */
const props = defineProps<{
  modelValue: RecurrenceFormValue
  startDate: Date | null
  // Série de la tâche modifiée (absente à la création ou hors série)
  series?: RecurrenceSummary | null
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: RecurrenceFormValue): void
  (e: 'need-start-date'): void
}>()

const { t } = useI18n()

// Composants PrimeVue internes détachés du formulaire parent : sans cela, ils
// liraient et écriraient la valeur du FormField `recurrence` (l'objet entier)
// au lieu de leur propre modelValue
provide('$pcForm', undefined)
provide('$pcFormField', undefined)

// Série de la tâche encore en cours (active ou en pause) : elle peut être arrêtée
const seriesLive = computed(() => !!props.series && props.series.status !== 'ended')

// Série en pause, tant qu'une répétition reste choisie : pas de prochaine date
const seriesPaused = computed(() => props.series?.status === 'paused' && props.modelValue.preset !== 'none')

// Points de départ proposés dans « Personnaliser… »
const anchorOptions = computed<{ value: RecurrenceAnchor; label: string }[]>(() => [
  { value: 'schedule', label: t('recurrence.fields.anchorSchedule') },
  { value: 'completion', label: t('recurrence.fields.anchorCompletion') },
])

// Règle personnalisée selon le calendrier : jours de la semaine, jour du mois et « Ne pas empiler » proposés
const calendar = computed(() => props.modelValue.anchor !== 'completion')

// Libellés des préréglages, recalculés quand la date de début change
const presetOptions = computed(() => recurrencePresetOptions(props.startDate))

// Jours du mois proposés en mensuel (« le 15 », « le 3e jeudi », « le dernier jour »)
const monthlyOptions = computed(() => monthlyModeOptions(props.startDate))

// Unités de la règle personnalisée, au singulier pour un intervalle de 1
const unitOptions = computed(() => {
  const form = props.modelValue.interval === 1 ? 1 : 2
  return [
    { value: 'daily', label: t('recurrence.fields.unitDaily', form) },
    { value: 'weekly', label: t('recurrence.fields.unitWeekly', form) },
    { value: 'monthly', label: t('recurrence.fields.unitMonthly', form) },
    { value: 'yearly', label: t('recurrence.fields.unitYearly', form) },
  ]
})

/**
 * Règle actuelle, si elle est complète (date de début, intervalle valable,
 * au moins un jour en hebdomadaire, jours d'avance valables) : sert au résumé
 * et à la prochaine date.
 */
const input = computed(() => {
  const value = props.modelValue
  if (value.preset === 'custom') {
    if (value.interval === null || value.interval < 1 || value.interval > RECURRENCE_INTERVAL_MAX) return null
    if (value.frequency === 'weekly' && !value.weekdays.length) return null
    if (value.createEarly && !(value.leadDays && value.leadDays >= 1 && value.leadDays <= RECURRENCE_LEAD_DAYS_MAX)) {
      return null
    }
  }
  return toRecurrenceInput(value, props.startDate)
})

// Règle inchangée d'une série en cours : son résumé et sa prochaine date font foi
const unchangedSeries = computed(() =>
  seriesLive.value && props.series && input.value
    ? sameRecurrenceInput(input.value, summaryToInput(props.series))
    : false,
)

const summary = computed(() => {
  if (unchangedSeries.value && props.series) return describeRecurrence(props.series)
  return input.value && props.startDate ? describeRecurrenceInput(input.value, props.startDate) : ''
})

const nextRun = computed<Date | null>(() => {
  if (seriesPaused.value) return null
  if (unchangedSeries.value && props.series?.status === 'active') {
    return props.series.nextRunAt ? new Date(props.series.nextRunAt) : null
  }
  if (!input.value || !props.startDate) return null
  return previewNextRun(input.value, props.startDate, props.series?.generatedCount ?? 1)
})

// Après archivage, sans date : la série attend l'archivage de cette tâche
const waitingForArchive = computed(() => {
  if (seriesPaused.value || !input.value) return false
  if (unchangedSeries.value && props.series) return isWaitingForArchive(props.series)
  return input.value.anchor === 'completion'
})

// Jours 29 à 31 en mensuel (jour fixe), 29 février en annuel : date ramenée en fin de mois (calendrier)
const monthEndHint = computed(() => {
  const date = props.startDate
  if (!input.value || !date || input.value.anchor === 'completion') return ''

  const day = date.getDate()
  if (input.value.frequency === 'monthly' && input.value.monthlyMode === 'dayOfMonth' && day >= 29) {
    return t('recurrence.fields.monthEndHint', { day })
  }
  if (input.value.frequency === 'yearly' && date.getMonth() === 1 && day === 29) {
    return t('recurrence.fields.leapYearHint')
  }
  return ''
})

/**
 * Remplace des champs de la valeur
 * @param changes Champs modifiés
 */
function update(changes: Partial<RecurrenceFormValue>) {
  emit('update:modelValue', { ...props.modelValue, ...changes })
}

/**
 * Mode mensuel choisi (bouton radio)
 * @param monthlyMode Jour fixe, Ne jour de la semaine ou dernier jour
 */
function onMonthlyModeChange(monthlyMode: MonthlyMode) {
  update({ monthlyMode })
}

/**
 * Fin de série choisie (bouton radio)
 * @param endType Jamais, à une date ou après N occurrences
 */
function onEndTypeChange(endType: RecurrenceEndType) {
  update({ endType })
}

/**
 * Choix dans le champ « Répéter ». Une répétition demande une date de début ;
 * « Personnaliser… » part de la règle précédente.
 * @param preset Choix
 */
function onPresetChange(preset: RecurrencePreset) {
  if (preset !== 'none' && !props.startDate) emit('need-start-date')

  if (preset === 'custom') {
    emit('update:modelValue', toCustomValue(props.modelValue, props.startDate))
  } else {
    update({ preset })
  }
}

/**
 * Unité de la règle personnalisée. En passant à l'hebdomadaire sans jour
 * choisi, le jour de la date de début est proposé.
 * @param frequency Unité choisie
 */
function onUnitChange(frequency: RecurrenceFrequency) {
  const weekdays =
    frequency === 'weekly' && !props.modelValue.weekdays.length && props.startDate
      ? [isoWeekday(props.startDate)]
      : props.modelValue.weekdays
  update({ frequency, weekdays })
}

/**
 * Point de départ des dates. En revenant au calendrier en hebdomadaire sans
 * jour choisi, le jour de la date de début est proposé.
 * @param anchor Point de départ choisi
 */
function onAnchorChange(anchor: RecurrenceAnchor) {
  const weekdays =
    anchor === 'schedule' &&
    props.modelValue.frequency === 'weekly' &&
    !props.modelValue.weekdays.length &&
    props.startDate
      ? [isoWeekday(props.startDate)]
      : props.modelValue.weekdays
  update({ anchor, weekdays })
}

/**
 * Ajoute ou retire un jour de la semaine
 * @param day Jour ISO (lundi = 1)
 */
function toggleWeekday(day: number) {
  const days = props.modelValue.weekdays
  update({ weekdays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b) })
}

/**
 * Date de fin choisie : la fin « le » est sélectionnée avec elle (de même,
 * saisir un nombre d'occurrences sélectionne la fin « après »)
 * @param endsOn Date choisie (null si effacée)
 */
function onEndDateChange(endsOn: Date | Date[] | (Date | null)[] | null | undefined) {
  update({ endsOn: endsOn instanceof Date ? endsOn : null, endType: 'onDate' })
}
</script>

<style scoped>
@reference "tailwindcss";

.recurrence-hint {
  @apply text-sm;
  color: var(--p-text-muted-color);
}

.recurrence-custom {
  @apply flex flex-col gap-3 rounded-md p-3;
  border: 1px solid var(--p-content-border-color);
}

.weekday-button {
  @apply w-8 h-8 p-0;
}
</style>
