<script setup lang="ts">
import { computed, ref } from 'vue';
import { browser, type Browser } from 'wxt/browser';
import AppIcon from '@/components/AppIcon.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { useSettings } from '@/composables/useSettings';
import { updateSetting } from '@/utils/settings';

defineProps<{ query: URLSearchParams }>();

const { settings, set } = useSettings();
const extensions = ref<Browser.management.ExtensionInfo[]>([]);
const filter = ref('');

void browser.management.getAll().then((list) => {
  extensions.value = list
    .filter((ext) => ext.type === 'extension' && ext.id !== browser.runtime.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
});

const items = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  return extensions.value.filter((ext) => !keyword || ext.name.toLowerCase().includes(keyword) || ext.id.includes(keyword));
});

const excluded = computed(() => new Set(settings.extensionWhitelist));

function iconOf(ext: Browser.management.ExtensionInfo) {
  return [...(ext.icons ?? [])].sort((a, b) => b.size - a.size)[0]?.url;
}

function toggle(id: string) {
  return updateSetting('extensionWhitelist', (list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
}
</script>

<template>
  <div class="space-y-4">
    <div class="card divide-y divide-slate-100 dark:divide-slate-700">
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <div>
          <div class="text-sm font-medium">新标签页参与分组</div>
          <div class="muted mt-0.5 text-xs">chrome://newtab 与 edge://newtab 是否合并为一个分组</div>
        </div>
        <ToggleSwitch :model-value="settings.enableNewtabGrouping" @update:model-value="set('enableNewtabGrouping', $event)" />
      </div>
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <div>
          <div class="text-sm font-medium">用扩展名称作为分组名</div>
          <div class="muted mt-0.5 text-xs">扩展页面默认以扩展 ID 分组，开启后显示为扩展名称</div>
        </div>
        <ToggleSwitch :model-value="settings.extensionReplace" @update:model-value="set('extensionReplace', $event)" />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative flex-1">
        <AppIcon name="search" class="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input v-model="filter" class="input pl-9" placeholder="搜索扩展名称或 ID" />
      </div>
      <span class="muted text-sm">已排除 {{ settings.extensionWhitelist.length }} 个</span>
    </div>
    <p class="muted text-xs">关闭开关的扩展，其页面（如设置页、覆盖的新标签页）不会被自动分组。</p>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="ext in items" :key="ext.id" class="card flex items-center gap-3 p-3" :class="!ext.enabled && 'opacity-60'">
        <img v-if="iconOf(ext)" :src="iconOf(ext)" class="size-8 shrink-0" alt="" />
        <span v-else class="size-8 shrink-0 rounded-md bg-slate-200 dark:bg-slate-600" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium" :title="ext.name">{{ ext.name }}</div>
          <div class="muted truncate font-mono text-[11px]">{{ ext.id }}</div>
        </div>
        <ToggleSwitch :model-value="!excluded.has(ext.id)" :label="`${ext.name} 参与分组`" @update:model-value="toggle(ext.id)" />
      </div>
    </div>
  </div>
</template>
