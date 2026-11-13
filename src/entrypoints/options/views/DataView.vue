<script setup lang="ts">
import { ref } from 'vue';
import { browser } from 'wxt/browser';
import AppIcon from '@/components/AppIcon.vue';
import { DEFAULTS, LOCAL_KEYS, loadSettings, saveSettings, SYNC_KEYS, type Settings } from '@/utils/settings';

defineProps<{ query: URLSearchParams }>();

const fileInput = ref<HTMLInputElement>();
const mode = ref<'merge' | 'replace'>('merge');
const message = ref<{ type: 'ok' | 'error'; text: string } | null>(null);

async function exportConfig() {
  const settings = await loadSettings();
  const data = { app: 'TabGo', version: browser.runtime.getManifest().version, exportedAt: new Date().toISOString(), ...settings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabgo-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function uniq(list: unknown): string[] {
  return Array.isArray(list) ? [...new Set(list.filter((item): item is string => typeof item === 'string'))] : [];
}

/** 校验并合并导入的数据，兼容 2.x 只包含 whitelist / groupNames 的导出文件 */
function buildPatch(imported: Record<string, unknown>, current: Settings): Partial<Settings> {
  const replace = mode.value === 'replace';
  const patch: Partial<Settings> = {};

  for (const key of ['whitelist', 'extensionWhitelist'] as const) {
    if (!(key in imported)) continue;
    patch[key] = replace ? uniq(imported[key]) : uniq([...current[key], ...uniq(imported[key])]);
  }

  if (imported.groupNames && typeof imported.groupNames === 'object') {
    const groups: Record<string, string[]> = replace ? {} : structuredClone(current.groupNames);
    const owner = new Map(Object.entries(groups).flatMap(([name, domains]) => domains.map((d) => [d, name] as const)));
    for (const [name, domains] of Object.entries(imported.groupNames as Record<string, unknown>)) {
      for (const domain of uniq(domains)) {
        // 一个域名只属于一个分组：以导入文件为准
        const previous = owner.get(domain);
        if (previous) groups[previous] = (groups[previous] ?? []).filter((d) => d !== domain);
        (groups[name] ??= []).push(domain);
        owner.set(domain, name);
      }
    }
    patch.groupNames = Object.fromEntries(Object.entries(groups).filter(([, domains]) => domains.length));
  }

  for (const key of LOCAL_KEYS) {
    if (key in imported && typeof imported[key] === typeof DEFAULTS[key]) {
      (patch as Record<string, unknown>)[key] = imported[key];
    }
  }
  return patch;
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== 'object') throw new Error('invalid');
    const patch = buildPatch(imported, await loadSettings());
    if (!Object.keys(patch).length) throw new Error('empty');
    await saveSettings(patch);
    message.value = { type: 'ok', text: `导入成功（${mode.value === 'merge' ? '合并' : '覆盖'}），共更新 ${Object.keys(patch).length} 项配置` };
  } catch {
    message.value = { type: 'error', text: '导入失败：文件不是有效的 TabGo 配置' };
  }
}

async function resetAll() {
  if (!confirm('确定恢复默认设置吗？白名单、分组规则和所有设置都会被清空，此操作不可撤销。')) return;
  await Promise.all([browser.storage.sync.remove(SYNC_KEYS), browser.storage.local.remove(LOCAL_KEYS)]);
  message.value = { type: 'ok', text: '已恢复默认设置' };
}
</script>

<template>
  <div class="max-w-3xl space-y-4">
    <div class="card p-5">
      <div class="flex items-start justify-between gap-6">
        <div>
          <div class="text-sm font-semibold">导出配置</div>
          <div class="muted mt-1 text-xs">导出白名单、分组规则、扩展白名单和全部设置为 JSON 文件</div>
        </div>
        <button class="btn btn-primary" @click="exportConfig"><AppIcon name="download" />导出</button>
      </div>
    </div>

    <div class="card p-5">
      <div class="flex items-start justify-between gap-6">
        <div>
          <div class="text-sm font-semibold">导入配置</div>
          <div class="muted mt-1 text-xs">支持 TabGo 3.x 与 2.x 的导出文件</div>
          <div class="mt-3 flex gap-4 text-sm">
            <label class="flex items-center gap-1.5"><input v-model="mode" type="radio" value="merge" />合并到现有配置</label>
            <label class="flex items-center gap-1.5"><input v-model="mode" type="radio" value="replace" />覆盖现有配置</label>
          </div>
        </div>
        <button class="btn btn-secondary" @click="fileInput?.click()"><AppIcon name="upload" />选择文件</button>
        <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFileSelected" />
      </div>
    </div>

    <div class="card border-red-200 p-5 dark:border-red-900">
      <div class="flex items-start justify-between gap-6">
        <div>
          <div class="text-sm font-semibold text-red-600 dark:text-red-400">恢复默认设置</div>
          <div class="muted mt-1 text-xs">清空所有规则和设置。建议先导出备份</div>
        </div>
        <button class="btn btn-danger border border-red-200 dark:border-red-900" @click="resetAll">恢复默认</button>
      </div>
    </div>

    <p
      v-if="message"
      class="rounded-lg px-4 py-2.5 text-sm"
      :class="message.type === 'ok' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'"
    >
      {{ message.text }}
    </p>
  </div>
</template>
