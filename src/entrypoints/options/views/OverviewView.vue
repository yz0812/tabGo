<script setup lang="ts">
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import AppIcon from '@/components/AppIcon.vue';
import FavIcon from '@/components/FavIcon.vue';
import { useBrowserTabs, type Tab, type TabGroup } from '@/composables/useBrowserTabs';
import { useSettings } from '@/composables/useSettings';
import { GROUP_COLOR_HEX } from '@/utils/colors';
import { sendMessage, type WindowAction } from '@/utils/messages';

const { windows, tabs, groups } = useBrowserTabs();
const { settings } = useSettings();
const expanded = ref(new Set<number>());
const busy = ref(false);

const stats = computed(() => [
  { label: '窗口', value: windows.value.length },
  { label: '标签页', value: tabs.value.length },
  { label: '分组', value: groups.value.length },
  { label: '自定义规则', value: Object.values(settings.groupNames).flat().length },
]);

function toggleExpanded(groupId: number) {
  const next = new Set(expanded.value);
  if (!next.delete(groupId)) next.add(groupId);
  expanded.value = next;
}

async function runAll(type: WindowAction) {
  busy.value = true;
  try {
    await Promise.all(windows.value.map((win) => sendMessage('windowAction', { type, windowId: win.id })));
  } finally {
    busy.value = false;
  }
}

function runWindow(type: WindowAction, windowId: number) {
  return sendMessage('windowAction', { type, windowId });
}

function toggleCollapsed(group: TabGroup) {
  return browser.tabGroups.update(group.id, { collapsed: !group.collapsed });
}

function ungroup(groupTabs: Tab[]) {
  return browser.tabs.ungroup(groupTabs.map((tab) => tab.id!) as [number, ...number[]]);
}

function activate(tab: Tab) {
  return sendMessage('activateTab', { tabId: tab.id!, windowId: tab.windowId });
}

function closeTab(tab: Tab) {
  return browser.tabs.remove(tab.id!);
}

function hostOf(url = '') {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 统计 + 全局操作 -->
    <div class="flex flex-wrap items-stretch gap-3">
      <div v-for="stat in stats" :key="stat.label" class="card min-w-28 px-4 py-3">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ stat.value }}</div>
        <div class="muted text-xs">{{ stat.label }}</div>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button class="btn btn-primary" :disabled="busy" @click="runAll('regroup')">
          <AppIcon name="bolt" />全部重新分组
        </button>
        <button class="btn btn-secondary" :disabled="busy" @click="runAll('collapseAll')">
          <AppIcon name="collapse" />全部折叠
        </button>
        <button class="btn btn-secondary" :disabled="busy" @click="runAll('expandAll')">
          <AppIcon name="expand" />全部展开
        </button>
        <button class="btn btn-secondary" :disabled="busy" @click="runAll('ungroupAll')">
          <AppIcon name="unlink" />取消全部分组
        </button>
      </div>
    </div>

    <!-- 窗口 -->
    <section v-for="(win, index) in windows" :key="win.id" class="card overflow-hidden">
      <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
        <AppIcon name="window" :size="18" class="text-slate-400" />
        <span class="font-semibold">窗口 {{ index + 1 }}</span>
        <span v-if="win.focused" class="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">当前窗口</span>
        <span class="muted text-sm">{{ win.tabCount }} 个标签 · {{ win.groups.length }} 个分组</span>
        <div class="ml-auto flex gap-1">
          <button class="btn btn-ghost" @click="runWindow('regroup', win.id)"><AppIcon name="bolt" />分组</button>
          <button class="btn btn-ghost" @click="runWindow('collapseAll', win.id)"><AppIcon name="collapse" />折叠</button>
          <button class="btn btn-ghost" @click="runWindow('ungroupAll', win.id)"><AppIcon name="unlink" />取消分组</button>
        </div>
      </header>

      <div class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="{ group, tabs: groupTabs } in win.groups"
          :key="group.id"
          class="rounded-lg border border-slate-200 dark:border-slate-700"
        >
          <div class="flex items-center gap-2 px-3 py-2">
            <button class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="toggleExpanded(group.id)">
              <AppIcon :name="expanded.has(group.id) ? 'chevronDown' : 'chevronRight'" class="text-slate-400" />
              <span class="size-2.5 shrink-0 rounded-full" :style="{ background: GROUP_COLOR_HEX[group.color] }" />
              <span class="truncate text-sm font-medium">{{ group.title || '（未命名）' }}</span>
              <span class="muted text-xs">{{ groupTabs.length }}</span>
            </button>
            <button class="btn btn-ghost px-1.5" :title="group.collapsed ? '展开' : '折叠'" @click="toggleCollapsed(group)">
              <AppIcon :name="group.collapsed ? 'expand' : 'collapse'" />
            </button>
            <button class="btn btn-ghost px-1.5" title="取消该分组" @click="ungroup(groupTabs)">
              <AppIcon name="unlink" />
            </button>
          </div>
          <ul v-if="expanded.has(group.id)" class="border-t border-slate-100 py-1 dark:border-slate-700">
            <li
              v-for="tab in groupTabs"
              :key="tab.id"
              class="group/tab flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <FavIcon :src="tab.favIconUrl" />
              <button class="min-w-0 flex-1 truncate text-left" :title="tab.url" @click="activate(tab)">
                {{ tab.title || tab.url }}
              </button>
              <button class="invisible text-slate-400 group-hover/tab:visible hover:text-red-500" title="关闭" @click="closeTab(tab)">
                <AppIcon name="x" :size="14" />
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="win.ungrouped.length"
          class="rounded-lg border border-dashed border-slate-300 dark:border-slate-600"
        >
          <button class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="toggleExpanded(-win.id - 1)">
            <AppIcon :name="expanded.has(-win.id - 1) ? 'chevronDown' : 'chevronRight'" class="text-slate-400" />
            <span class="text-sm font-medium">未分组</span>
            <span class="muted text-xs">{{ win.ungrouped.length }}</span>
          </button>
          <ul v-if="expanded.has(-win.id - 1)" class="border-t border-slate-100 py-1 dark:border-slate-700">
            <li
              v-for="tab in win.ungrouped"
              :key="tab.id"
              class="group/tab flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <FavIcon :src="tab.favIconUrl" />
              <button class="min-w-0 flex-1 truncate text-left" :title="tab.url" @click="activate(tab)">
                {{ tab.title || hostOf(tab.url) }}
              </button>
              <span v-if="tab.pinned" class="chip">固定</span>
              <button class="invisible text-slate-400 group-hover/tab:visible hover:text-red-500" title="关闭" @click="closeTab(tab)">
                <AppIcon name="x" :size="14" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
