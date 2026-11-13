<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type Component } from 'vue';
import { browser } from 'wxt/browser';
import AppIcon from '@/components/AppIcon.vue';
import DataView from './views/DataView.vue';
import ExtensionsView from './views/ExtensionsView.vue';
import OverviewView from './views/OverviewView.vue';
import RulesView from './views/RulesView.vue';
import SettingsView from './views/SettingsView.vue';
import WhitelistView from './views/WhitelistView.vue';

type IconName = InstanceType<typeof AppIcon>['$props']['name'];

const routes: { path: string; label: string; icon: IconName; component: Component }[] = [
  { path: '/overview', label: '概览', icon: 'window', component: OverviewView },
  { path: '/rules', label: '分组规则', icon: 'tag', component: RulesView },
  { path: '/whitelist', label: '网站白名单', icon: 'shield', component: WhitelistView },
  { path: '/extensions', label: '扩展与特殊页', icon: 'puzzle', component: ExtensionsView },
  { path: '/settings', label: '设置', icon: 'cog', component: SettingsView },
  { path: '/data', label: '数据管理', icon: 'database', component: DataView },
];

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: routes.some((r) => r.path === path) ? path : '/overview', query: new URLSearchParams(query) };
}

const route = ref(parseHash());
const onHashChange = () => (route.value = parseHash());
window.addEventListener('hashchange', onHashChange);
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange));

const current = computed(() => routes.find((r) => r.path === route.value.path)!);
const version = browser.runtime.getManifest().version;
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 dark:border-slate-700 dark:bg-slate-800"
    >
      <div class="mb-6 flex items-center gap-2 px-2">
        <img src="/icons/icon48.png" class="size-7" alt="" />
        <span class="text-lg font-bold text-blue-600 dark:text-blue-400">TabGo</span>
      </div>
      <nav class="flex flex-1 flex-col gap-1">
        <a
          v-for="item in routes"
          :key="item.path"
          :href="`#${item.path}`"
          class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
          :class="
            item.path === route.path
              ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
          "
        >
          <AppIcon :name="item.icon" :size="18" />
          {{ item.label }}
        </a>
      </nav>
      <div class="muted px-3 text-xs">v{{ version }}</div>
    </aside>

    <main class="min-w-0 flex-1 px-8 py-6">
      <div class="mx-auto max-w-6xl">
        <h1 class="mb-5 text-2xl font-bold">{{ current.label }}</h1>
        <KeepAlive>
          <component :is="current.component" :key="current.path" :query="route.query" />
        </KeepAlive>
      </div>
    </main>
  </div>
</template>
