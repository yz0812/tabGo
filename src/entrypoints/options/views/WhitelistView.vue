<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import FavIcon from '@/components/FavIcon.vue';
import { useBrowserTabs } from '@/composables/useBrowserTabs';
import { useSettings } from '@/composables/useSettings';
import { extractHostname } from '@/utils/domain';
import { addToWhitelist, removeFromWhitelist, updateSetting } from '@/utils/settings';

defineProps<{ query: URLSearchParams }>();

const { settings } = useSettings();
const { sites } = useBrowserTabs();

const input = ref('');
const filter = ref('');
const message = ref('');

const list = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  return [...settings.whitelist].filter((d) => !keyword || d.includes(keyword)).sort();
});
const suggestions = computed(() => sites.value.filter((site) => site.kind === 'web' && !site.whitelistRule));

/** 支持一次粘贴多个域名，用空格、逗号或换行分隔 */
async function addBatch() {
  const domains = [...new Set(input.value.split(/[\s,，;；]+/).map(extractHostname).filter(Boolean))];
  if (!domains.length) {
    message.value = '请输入有效的域名或网址';
    return;
  }
  const added = domains.filter((d) => !settings.whitelist.includes(d));
  await updateSetting('whitelist', (current) => [...new Set([...current, ...domains])]);
  message.value = `已添加 ${added.length} 个域名${domains.length > added.length ? `，${domains.length - added.length} 个已存在` : ''}`;
  input.value = '';
}

async function clearAll() {
  if (confirm(`确定清空全部 ${settings.whitelist.length} 条白名单吗？`)) await updateSetting('whitelist', () => []);
}
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
    <div class="min-w-0 space-y-4">
      <form class="card p-4" @submit.prevent="addBatch">
        <div class="mb-3 text-sm font-semibold">添加白名单</div>
        <div class="flex gap-2">
          <input
            v-model="input"
            class="input flex-1"
            placeholder="域名或网址，可用空格 / 逗号分隔一次添加多个"
            @input="message = ''"
          />
          <button class="btn btn-primary"><AppIcon name="plus" />添加</button>
        </div>
        <p class="muted mt-2 text-xs">
          {{ message || '白名单中的网站不会被自动分组。添加 example.com 会同时排除它的所有子域名。' }}
        </p>
      </form>

      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <AppIcon name="search" class="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input v-model="filter" class="input pl-9" placeholder="搜索白名单" />
        </div>
        <span class="muted text-sm">{{ settings.whitelist.length }} 条</span>
        <button v-if="settings.whitelist.length" class="btn btn-danger" @click="clearAll">清空</button>
      </div>

      <div v-if="!list.length" class="card muted px-6 py-12 text-center text-sm">
        {{ filter ? '没有匹配的域名' : '白名单为空' }}
      </div>
      <div v-else class="card grid gap-x-4 p-2 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="domain in list"
          :key="domain"
          class="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50"
        >
          <span class="truncate text-sm">{{ domain }}</span>
          <button class="invisible text-slate-400 group-hover:visible hover:text-red-500" title="移除" @click="removeFromWhitelist(domain)">
            <AppIcon name="x" :size="14" />
          </button>
        </div>
      </div>
    </div>

    <aside class="card h-fit overflow-hidden lg:sticky lg:top-6">
      <div class="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
        <div class="text-sm font-semibold">已打开的网站</div>
        <div class="muted text-xs">点击 + 直接加入白名单</div>
      </div>
      <ul class="max-h-[70vh] overflow-y-auto py-1">
        <li v-for="site in suggestions" :key="site.key" class="flex items-center gap-2.5 px-4 py-2">
          <FavIcon :src="site.favIconUrl" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ site.key }}</span>
          <button class="btn btn-ghost px-1.5" title="加入白名单" @click="addToWhitelist(site.key)">
            <AppIcon name="plus" />
          </button>
        </li>
        <li v-if="!suggestions.length" class="muted px-4 py-6 text-center text-sm">没有可添加的网站</li>
      </ul>
    </aside>
  </div>
</template>
