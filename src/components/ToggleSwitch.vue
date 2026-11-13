<script setup lang="ts">
const model = defineModel<boolean>({ required: true });
defineProps<{ label?: string }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none"
    :class="model ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'"
    @click="model = !model"
  >
    <span
      class="inline-block size-4 rounded-full bg-white shadow transition-transform"
      :class="model ? 'translate-x-4.5' : 'translate-x-0.5'"
    />
  </button>
</template>
