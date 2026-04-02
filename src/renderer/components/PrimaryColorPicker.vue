<template>
  <div class="border border-gray-300 inline-block rounded-md p-2">
    <div class="flex flex-wrap">
      <button
        v-for="color in primaryColors"
        :key="color.name"
        type="button"
        @click="applyColor(color)"
        :class="[
          'w-8 h-8 m-0.5 rounded-sm border-2 cursor-pointer',
          selectedColor === color.name ? 'border-black' : 'border-transparent',
        ]"
        :style="{ backgroundColor: color.palette?.[500] || '#000' }"
        :title="color.name"
      ></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { PRIMARY_COLORS } from "../constants/palette.constants";
import { useSettingsStore } from "../stores/Settings";
import { applyPrimaryColor } from "../utils/settings.helper";

const settings = useSettingsStore();
const selectedColor = ref(settings.primaryColor || "emerald");
const primaryColors = ref(PRIMARY_COLORS);

const applyColor = (color: {
  name: string;
  palette: Record<string, string>;
}) => {
  applyPrimaryColor(color);
  selectedColor.value = color.name;
};
</script>
