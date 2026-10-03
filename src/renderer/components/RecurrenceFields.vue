<template>
  <div class="flex flex-col gap-2 w-full" data-testid="recurrence-fields">
    <div class="flex items-center justify-between gap-2">
      <label for="recurrence" class="font-medium">Répéter</label>
      <!-- Raccourci vers « Ne pas répéter » : la série s'arrête à l'enregistrement -->
      <Button
        v-if="seriesLive && modelValue.preset !== 'none'"
        data-testid="recurrence-stop"
        label="Arrêter la série"
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
    <p v-if="nextRun" data-testid="recurrence-next" class="recurrence-hint">Prochaine : {{ formatNextRun(nextRun) }}</p>
    <p v-if="monthEndHint" data-testid="recurrence-month-end-hint" class="recurrence-hint">{{ monthEndHint }}</p>
    <p v-if="seriesLive && modelValue.preset === 'none'" data-testid="recurrence-stop-hint" class="recurrence-hint">
      La série s'arrêtera à l'enregistrement. Les occurrences déjà créées sont conservées.
    </p>

    <!-- Règle personnalisée -->
    <div v-if="modelValue.preset === 'custom'" data-testid="recurrence-custom" class="recurrence-custom">
      <div class="flex items-center gap-2">
        <span>{{ modelValue.frequency === 'weekly' ? 'Toutes les' : 'Tous les' }}</span>
        <InputNumber
          data-testid="recurrence-interval"
          :modelValue="modelValue.interval"
          :min="1"
          :max="RECURRENCE_INTERVAL_MAX"
          :useGrouping="false"
          inputClass="w-16"
          aria-label="Intervalle"
          @update:modelValue="(interval: number | null) => update({ interval })"
        />
        <Select
          data-testid="recurrence-unit"
          :modelValue="modelValue.frequency"
          :options="unitOptions"
          optionLabel="label"
          optionValue="value"
          aria-label="Unité"
          class="flex-1"
          @update:modelValue="onUnitChange"
        />
      </div>

      <!-- Jours de la semaine, hebdomadaire uniquement -->
      <div v-if="modelValue.frequency === 'weekly'" class="flex gap-1" role="group" aria-label="Jours de la semaine">
        <Button
          v-for="day in WEEKDAYS"
          :key="day.value"
          data-testid="recurrence-weekday"
          :data-weekday="day.value"
          :label="day.letter"
          :aria-label="day.name"
          :aria-pressed="modelValue.weekdays.includes(day.value)"
          :outlined="!modelValue.weekdays.includes(day.value)"
          size="small"
          rounded
          class="weekday-button"
          @click="toggleWeekday(day.value)"
        />
      </div>

      <!-- Jour du mois, mensuel uniquement : libellés tirés de la date de début -->
      <div
        v-if="modelValue.frequency === 'monthly'"
        class="flex flex-col gap-2"
        role="radiogroup"
        aria-label="Jour du mois"
      >
        <div v-for="option in monthlyOptions" :key="option.value" class="flex items-center gap-2">
          <RadioButton
            :inputId="`recurrence-monthly-${option.value}`"
            data-testid="recurrence-monthly-mode"
            :data-mode="option.value"
            :value="option.value"
            :modelValue="modelValue.monthlyMode"
            @update:modelValue="(monthlyMode: MonthlyMode) => update({ monthlyMode })"
          />
          <label :for="`recurrence-monthly-${option.value}`" data-testid="recurrence-monthly-label">
            {{ option.label }}
          </label>
        </div>
      </div>

      <!-- Fin de la série -->
      <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="recurrence-end-label">
        <span id="recurrence-end-label">Se termine</span>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-never"
            data-testid="recurrence-end-never"
            value="never"
            :modelValue="modelValue.endType"
            @update:modelValue="(endType: RecurrenceEndType) => update({ endType })"
          />
          <label for="recurrence-end-never">Jamais</label>
        </div>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-on-date"
            data-testid="recurrence-end-on-date"
            value="onDate"
            :modelValue="modelValue.endType"
            @update:modelValue="(endType: RecurrenceEndType) => update({ endType })"
          />
          <label for="recurrence-end-on-date">Le</label>
          <DatePicker
            data-testid="recurrence-end-date"
            :modelValue="modelValue.endsOn"
            dateFormat="dd/mm/yy"
            placeholder="Date de fin"
            @update:modelValue="onEndDateChange"
          />
        </div>

        <div class="flex items-center gap-2">
          <RadioButton
            inputId="recurrence-end-after-count"
            data-testid="recurrence-end-after-count"
            value="afterCount"
            :modelValue="modelValue.endType"
            @update:modelValue="(endType: RecurrenceEndType) => update({ endType })"
          />
          <label for="recurrence-end-after-count">Après</label>
          <InputNumber
            data-testid="recurrence-end-count"
            :modelValue="modelValue.maxCount"
            :min="1"
            :max="RECURRENCE_COUNT_MAX"
            :useGrouping="false"
            inputClass="w-16"
            aria-label="Nombre d'occurrences"
            @update:modelValue="(maxCount: number | null) => update({ maxCount, endType: 'afterCount' })"
          />
          <span>occurrences</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Checkbox
          inputId="recurrence-skip"
          data-testid="recurrence-skip"
          binary
          :modelValue="modelValue.skipIfPending"
          @update:modelValue="(skipIfPending: boolean) => update({ skipIfPending })"
        />
        <label for="recurrence-skip">Ne pas empiler les occurrences</label>
      </div>
      <p class="recurrence-hint">Pas de nouvelle occurrence tant que la précédente est au tableau.</p>
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
  type MonthlyMode,
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
  monthlyModeOptions,
  previewNextRun,
  recurrencePresetOptions,
  sameRecurrenceInput,
  summaryToInput,
  toCustomValue,
  toRecurrenceInput,
} from '../utils/recurrence.helper'

/**
 * Champ « Répéter » du formulaire de tâche (cf. TaskDialog) : préréglages
 * calculés depuis la date de début, bloc « Personnaliser… », résumé en clair
 * de la règle et prochaine date.
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

// Composants PrimeVue internes détachés du formulaire parent : sans cela, ils
// liraient et écriraient la valeur du FormField `recurrence` (l'objet entier)
// au lieu de leur propre modelValue
provide('$pcForm', undefined)
provide('$pcFormField', undefined)

// Série de la tâche encore en cours (active ou en pause) : elle peut être arrêtée
const seriesLive = computed(() => !!props.series && props.series.status !== 'ended')

// Libellés des préréglages, recalculés quand la date de début change
const presetOptions = computed(() => recurrencePresetOptions(props.startDate))

// Jours du mois proposés en mensuel (« le 15 », « le 3e jeudi », « le dernier jour »)
const monthlyOptions = computed(() => monthlyModeOptions(props.startDate))

// Unités de la règle personnalisée, au singulier pour un intervalle de 1
const unitOptions = computed(() => {
  const plural = props.modelValue.interval !== 1
  return [
    { value: 'daily', label: plural ? 'jours' : 'jour' },
    { value: 'weekly', label: plural ? 'semaines' : 'semaine' },
    { value: 'monthly', label: 'mois' },
    { value: 'yearly', label: plural ? 'ans' : 'an' },
  ]
})

/**
 * Règle actuelle, si elle est complète (date de début, intervalle valable et
 * au moins un jour en hebdomadaire) : sert au résumé et à la prochaine date.
 */
const input = computed(() => {
  const value = props.modelValue
  if (value.preset === 'custom') {
    if (value.interval === null || value.interval < 1 || value.interval > RECURRENCE_INTERVAL_MAX) return null
    if (value.frequency === 'weekly' && !value.weekdays.length) return null
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
  if (unchangedSeries.value && props.series?.status === 'active') {
    return props.series.nextRunAt ? new Date(props.series.nextRunAt) : null
  }
  if (!input.value || !props.startDate) return null
  return previewNextRun(input.value, props.startDate, props.series?.generatedCount ?? 1)
})

// Jours 29 à 31 en mensuel (jour fixe), 29 février en annuel : date ramenée en fin de mois
const monthEndHint = computed(() => {
  const date = props.startDate
  if (!input.value || !date) return ''

  const day = date.getDate()
  if (input.value.frequency === 'monthly' && input.value.monthlyMode === 'dayOfMonth' && day >= 29) {
    return `Les mois de moins de ${day} jours, l'occurrence tombe le dernier jour du mois.`
  }
  if (input.value.frequency === 'yearly' && date.getMonth() === 1 && day === 29) {
    return "Les années non bissextiles, l'occurrence tombe le 28 février."
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
