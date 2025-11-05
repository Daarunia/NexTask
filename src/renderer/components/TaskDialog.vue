<template>
    <Dialog v-model:visible="visible" :modal="true" :show-header="false" :draggable="true" class="max-w-md w-full">
        <div class="pt-4 flex flex-col gap-4">
            <!-- Titre -->
            <div class="flex flex-col gap-2 w-full">
                <label for="inputValue" class="font-medium">Titre</label>
                <InputText id="inputValue" v-model="inputValue" class="w-full" />
            </div>

            <!-- Boutons -->
            <div class="flex gap-2 w-full">
                <Button type="button" label="Cancel" severity="secondary" class="flex-1" @click="visible = false" />
                <Button type="button" label="Save" class="flex-1" @click="visible = false" />
            </div>
        </div>
    </Dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'

// Props
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
})

// Émission d'événement pour le v-model
const emit = defineEmits(['update:modelValue'])

// Data locale
const visible = ref(props.modelValue)
const inputValue = ref('')

// Synchroniser l’état interne <-> parent de l'état d'ouverture
watch(() => props.modelValue, (val) => (visible.value = val))
watch(visible, (val) => emit('update:modelValue', val))
</script>