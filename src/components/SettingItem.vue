<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="flex items-center justify-between gap-6 px-5 py-3.5">
    <div class="min-w-0">
      <div class="text-sm font-medium">{{ title }}</div>
      <div v-if="description" class="muted mt-0.5 text-xs leading-relaxed">{{ description }}</div>
    </div>
    <div class="shrink-0">
      <slot />
    </div>
  </div>
</template>
