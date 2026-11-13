<script setup lang="ts">
import { ref } from 'vue';

const model = defineModel<string>({ required: true });
const recording = ref(false);

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta'];

function label(value: string): string {
  return MODIFIERS.includes(value) ? `双击 ${value === 'Control' ? 'Ctrl' : value}` : value;
}

function onKeyDown(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    (event.target as HTMLElement).blur();
    return;
  }
  // 单独按修饰键 => 双击触发；否则需要组合键（至少一个修饰键），避免误触普通按键
  if (MODIFIERS.includes(event.key)) {
    model.value = event.key;
    return;
  }
  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Meta',
  ].filter(Boolean);
  if (!modifiers.length) return;
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  model.value = [...modifiers, key].join('+');
  (event.target as HTMLElement).blur();
}
</script>

<template>
  <button
    type="button"
    class="input w-40 text-center"
    :class="recording && 'border-blue-500 ring-2 ring-blue-500/20'"
    @focus="recording = true"
    @blur="recording = false"
    @keydown="onKeyDown"
  >
    {{ recording ? '请按下快捷键…' : label(model) }}
  </button>
</template>
