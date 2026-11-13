<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { browser, type Browser } from 'wxt/browser';
import AppIcon from '@/components/AppIcon.vue';
import FavIcon from '@/components/FavIcon.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { useSettings } from '@/composables/useSettings';
import type { GroupResolution } from '@/utils/grouping';
import { sendMessage, type WindowAction } from '@/utils/messages';
import { openDashboard } from '@/utils/navigation';
import {
  addToWhitelist,
  assignDomainToGroup,
  removeDomainFromGroups,
  removeFromWhitelist,
  updateSetting,
} from '@/utils/settings';

const { settings, set } = useSettings();

const tab = ref<Browser.tabs.Tab>();
const site = ref<GroupResolution | null>(null);
const groupNameInput = ref('');
const busy = ref<string | null>(null);

const groupNameOptions = computed(() => Object.keys(settings.groupNames).sort());
const isWeb = computed(() => /^https?:/.test(tab.value?.url ?? ''));
const isExtension = computed(() => /^(chrome-)?extension:/.test(tab.value?.url ?? ''));

async function resolveCurrent() {
  if (!tab.value?.url) return;
  site.value = await sendMessage('resolveUrl', { url: tab.value.url });
  const alias = site.value?.aliasRule;
  groupNameInput.value = alias
    ? Object.entries(settings.groupNames).find(([, domains]) => domains.includes(alias))?.[0] ?? ''
    : '';
}

void browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
  tab.value = active;
  void resolveCurrent();
});

// 规则变化后（包括本页的操作）重新计算当前网站状态
watch(
  () => [settings.groupNames, settings.whitelist, settings.extensionWhitelist, settings.subdomainEnabled],
  () => void resolveCurrent(),
  { deep: true },
);

async function saveGroupName() {
  const name = groupNameInput.value.trim();
  if (!site.value?.key || !name) return;
  await assignDomainToGroup(site.value.key, name);
}

async function resetGroupName() {
  if (site.value?.aliasRule) await removeDomainFromGroups(site.value.aliasRule);
}

async function toggleWhitelist() {
  if (!site.value?.key) return;
  if (site.value.whitelistRule) await removeFromWhitelist(site.value.whitelistRule);
  else await addToWhitelist(site.value.key);
}

async function toggleExtensionWhitelist() {
  const id = site.value?.key;
  if (!id) return;
  await updateSetting('extensionWhitelist', (list) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
  );
}

async function run(type: WindowAction) {
  busy.value = type;
  try {
    await sendMessage('windowAction', { type, windowId: tab.value?.windowId });
  } finally {
    busy.value = null;
  }
}

const actions: { type: WindowAction; label: string; icon: 'bolt' | 'collapse' | 'expand' | 'unlink' }[] = [
  { type: 'regroup', label: '立即分组', icon: 'bolt' },
  { type: 'collapseAll', label: '全部折叠', icon: 'collapse' },
  { type: 'expandAll', label: '全部展开', icon: 'expand' },
  { type: 'ungroupAll', label: '取消分组', icon: 'unlink' },
];

const toggles = [
  { key: 'subdomainEnabled', label: '按子域名分组' },
  { key: 'groupTop', label: '分组排在最前' },
  { key: 'accordion', label: '手风琴模式' },
  { key: 'enableTabSearch', label: '页面内标签搜索' },
] as const;

function open(hash = '') {
  void openDashboard(hash);
  window.close();
}
</script>

<template>
  <div class="w-[340px] space-y-3 p-3">
    <!-- 标题栏 -->
    <header class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <img src="/icons/icon48.png" class="size-6" alt="" />
        <span class="text-base font-bold text-blue-600 dark:text-blue-400">TabGo</span>
      </div>
      <button class="btn btn-ghost px-2" title="打开控制台" @click="open()">
        <AppIcon name="squares" />
        控制台
      </button>
    </header>

    <!-- 当前网站 -->
    <section class="card p-3">
      <div class="flex items-center gap-2.5">
        <FavIcon :src="tab?.favIconUrl" :size="20" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold">{{ site?.key ?? '当前页面' }}</div>
          <div class="muted truncate text-xs">
            <template v-if="!site?.key">此页面不参与分组</template>
            <template v-else-if="site.whitelistRule">白名单中（规则：{{ site.whitelistRule }}），不参与分组</template>
            <template v-else-if="!site.name">不参与分组</template>
            <template v-else>
              分组：<span class="font-medium text-slate-700 dark:text-slate-200">{{ site.name }}</span>
              <span v-if="site.aliasRule">（自定义）</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 网页：设置分组名称 / 白名单 -->
      <div v-if="isWeb && site?.key" class="mt-3 space-y-2">
        <form v-if="!site.whitelistRule" class="flex gap-2" @submit.prevent="saveGroupName">
          <input
            v-model="groupNameInput"
            list="group-name-options"
            class="input"
            :placeholder="`自定义分组名，默认「${site.managedName}」`"
          />
          <datalist id="group-name-options">
            <option v-for="name in groupNameOptions" :key="name" :value="name" />
          </datalist>
          <button class="btn btn-primary" :disabled="!groupNameInput.trim()">保存</button>
        </form>
        <div class="flex gap-2">
          <button class="btn btn-secondary flex-1" @click="toggleWhitelist">
            <AppIcon name="shield" />
            {{ site.whitelistRule ? '移出白名单' : '加入白名单' }}
          </button>
          <button v-if="site.aliasRule && !site.whitelistRule" class="btn btn-secondary flex-1" @click="resetGroupName">
            恢复默认名称
          </button>
        </div>
      </div>

      <!-- 扩展页面 -->
      <div v-else-if="isExtension && site?.key" class="mt-3">
        <button class="btn btn-secondary w-full" @click="toggleExtensionWhitelist">
          <AppIcon name="puzzle" />
          {{ settings.extensionWhitelist.includes(site.key) ? '恢复参与分组' : '此扩展不参与分组' }}
        </button>
      </div>
    </section>

    <!-- 窗口操作 -->
    <section class="grid grid-cols-4 gap-2">
      <button
        v-for="action in actions"
        :key="action.type"
        class="card flex flex-col items-center gap-1 px-1 py-2.5 text-xs transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:hover:border-blue-500 dark:hover:text-blue-400"
        :disabled="busy !== null"
        @click="run(action.type)"
      >
        <AppIcon :name="action.icon" :size="18" />
        {{ action.label }}
      </button>
    </section>

    <!-- 常用开关 -->
    <section class="card divide-y divide-slate-100 dark:divide-slate-700">
      <label
        v-for="toggle in toggles"
        :key="toggle.key"
        class="flex items-center justify-between px-3 py-2.5 text-sm"
      >
        {{ toggle.label }}
        <ToggleSwitch
          :model-value="settings[toggle.key]"
          :label="toggle.label"
          @update:model-value="set(toggle.key, $event)"
        />
      </label>
    </section>

    <footer class="flex justify-between px-1 text-xs">
      <button class="muted hover:text-blue-600" @click="open('/rules')">分组规则</button>
      <button class="muted hover:text-blue-600" @click="open('/whitelist')">白名单</button>
      <button class="muted hover:text-blue-600" @click="open('/settings')">全部设置</button>
    </footer>
  </div>
</template>
