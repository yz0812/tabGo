<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ src?: string; size?: number }>();
const failed = ref(false);
watch(() => props.src, () => (failed.value = false));
</script>

<template>
  <img
    v-if="src && !failed && /^(https?|data):/.test(src)"
    :src="src"
    :width="size ?? 16"
    :height="size ?? 16"
    class="shrink-0 rounded-sm"
    loading="lazy"
    alt=""
    @error="failed = true"
  />
  <span
    v-else
    class="inline-block shrink-0 rounded-sm bg-slate-200 dark:bg-slate-600"
    :style="{ width: `${size ?? 16}px`, height: `${size ?? 16}px` }"
  />
</template>
