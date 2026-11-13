<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import FavIcon from '@/components/FavIcon.vue';
import { useBrowserTabs } from '@/composables/useBrowserTabs';
import { useSettings } from '@/composables/useSettings';
import { extractHostname } from '@/utils/domain';
import { assignDomainToGroup, removeDomainFromGroups, updateSetting } from '@/utils/settings';

const props = defineProps<{ query: URLSearchParams }>();

const { settings } = useSettings();
const { sites } = useBrowserTabs();

const domainInput = ref('');
const groupInput = ref('');
const groupInputEl = ref<HTMLInputElement>();
const filter = ref('');
const error = ref('');
const editing = ref<string | null>(null);
const editingName = ref('');
const addingTo = ref<string | null>(null);
const addingDomain = ref('');

const groupNames = computed(() => Object.keys(settings.groupNames));
const webSites = computed(() => sites.value.filter((site) => site.kind === 'web'));

const rules = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  return Object.entries(settings.groupNames)
    .filter(([name, domains]) => !keyword || name.toLowerCase().includes(keyword) || domains.some((d) => d.includes(keyword)))
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
});

// 从右键菜单 / 弹窗跳转过来时预填域名
watch(
  () => props.query.get('domain'),
  async (domain) => {
    if (!domain) return;
    domainInput.value = domain;
    groupInput.value = '';
    await nextTick();
    groupInputEl.value?.focus();
  },
  { immediate: true },
);

function pickSite(key: string, name?: string | null) {
  domainInput.value = key;
  groupInput.value = name && settings.groupNames[name] ? name : '';
  groupInputEl.value?.focus();
}

async function addRule() {
  error.value = '';
  const domain = extractHostname(domainInput.value);
  const name = groupInput.value.trim();
  if (!domain) return void (error.value = '请输入有效的域名或网址');
  if (!name) return void (error.value = '请输入分组名称');
  await assignDomainToGroup(domain, name);
  domainInput.value = '';
  groupInput.value = '';
}

async function addDomainTo(name: string) {
  const domain = extractHostname(addingDomain.value);
  if (domain) await assignDomainToGroup(domain, name);
  addingDomain.value = '';
  addingTo.value = null;
}

function startRename(name: string) {
  editing.value = name;
  editingName.value = name;
}

async function finishRename() {
  const from = editing.value;
  const to = editingName.value.trim();
  editing.value = null;
  if (!from || !to || from === to) return;
  // 重命名到已存在的分组时合并域名
  await updateSetting('groupNames', (groups) => {
    const next: Record<string, string[]> = {};
    for (const [name, domains] of Object.entries(groups)) {
      const target = name === from ? to : name;
      next[target] = [...new Set([...(next[target] ?? []), ...domains])];
    }
    return next;
  });
}

async function deleteGroup(name: string) {
  if (!confirm(`确定删除分组「${name}」及其 ${settings.groupNames[name]?.length ?? 0} 条域名规则吗？`)) return;
  await updateSetting('groupNames', (groups) => {
    const { [name]: _removed, ...rest } = groups;
    return rest;
  });
}
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
    <div class="min-w-0 space-y-4">
      <!-- 新增规则 -->
      <form class="card p-4" @submit.prevent="addRule">
        <div class="mb-3 text-sm font-semibold">添加规则</div>
        <div class="flex flex-wrap gap-2">
          <input
            v-model="domainInput"
            list="rule-domain-options"
            class="input min-w-48 flex-1"
            placeholder="域名或网址，如 google.com（同时匹配其子域名）"
          />
          <datalist id="rule-domain-options">
            <option v-for="site in webSites" :key="site.key" :value="site.key" />
          </datalist>
          <input
            ref="groupInputEl"
            v-model="groupInput"
            list="rule-group-options"
            class="input min-w-40 flex-1"
            placeholder="分组名称（可选择已有分组）"
          />
          <datalist id="rule-group-options">
            <option v-for="name in groupNames" :key="name" :value="name" />
          </datalist>
          <button class="btn btn-primary"><AppIcon name="plus" />添加</button>
        </div>
        <p v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</p>
        <p v-else class="muted mt-2 text-xs">多个域名可以归入同一个分组；一个域名只会属于一个分组，重复添加会自动移动。</p>
      </form>

      <!-- 规则列表 -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <AppIcon name="search" class="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input v-model="filter" class="input pl-9" placeholder="搜索分组名或域名" />
        </div>
        <span class="muted text-sm">{{ rules.length }} 个分组</span>
      </div>

      <div v-if="!rules.length" class="card muted px-6 py-12 text-center text-sm">
        {{ filter ? '没有匹配的分组' : '还没有自定义分组。可以在右侧"已打开的网站"中一键添加。' }}
      </div>

      <div class="grid gap-3 xl:grid-cols-2">
        <div v-for="[name, domains] in rules" :key="name" class="card p-4">
          <div class="mb-3 flex items-center gap-2">
            <input
              v-if="editing === name"
              v-model="editingName"
              class="input py-1 font-semibold"
              autofocus
              @keydown.enter.prevent="finishRename"
              @keydown.esc="editing = null"
              @blur="finishRename"
            />
            <template v-else>
              <span class="truncate font-semibold">{{ name }}</span>
              <span class="muted text-xs">{{ domains.length }} 个域名</span>
            </template>
            <div class="ml-auto flex shrink-0">
              <button class="btn btn-ghost px-1.5" title="重命名" @click="startRename(name)"><AppIcon name="pencil" /></button>
              <button class="btn btn-danger px-1.5" title="删除分组" @click="deleteGroup(name)"><AppIcon name="trash" /></button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span v-for="domain in domains" :key="domain" class="chip">
              {{ domain }}
              <button class="text-slate-400 hover:text-red-500" title="移除" @click="removeDomainFromGroups(domain)">
                <AppIcon name="x" :size="12" />
              </button>
            </span>
            <form v-if="addingTo === name" class="inline-flex" @submit.prevent="addDomainTo(name)">
              <input
                v-model="addingDomain"
                list="rule-domain-options"
                class="input w-44 py-0.5 text-xs"
                placeholder="输入域名后回车"
                autofocus
                @blur="addingDomain ? addDomainTo(name) : (addingTo = null)"
                @keydown.esc="addingTo = null"
              />
            </form>
            <button v-else class="chip border border-dashed border-slate-300 bg-transparent hover:border-blue-400 hover:text-blue-600 dark:border-slate-600" @click="addingTo = name">
              <AppIcon name="plus" :size="12" />域名
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 已打开的网站 -->
    <aside class="card h-fit overflow-hidden lg:sticky lg:top-6">
      <div class="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
        <div class="text-sm font-semibold">已打开的网站</div>
        <div class="muted text-xs">点击即可为该网站设置分组名称</div>
      </div>
      <ul class="max-h-[70vh] overflow-y-auto py-1">
        <li v-for="site in webSites" :key="site.key">
          <button
            class="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
            :class="site.whitelistRule && 'opacity-50'"
            @click="pickSite(site.key, site.name)"
          >
            <FavIcon :src="site.favIconUrl" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm">{{ site.key }}</div>
              <div class="muted truncate text-xs">
                {{ site.whitelistRule ? '白名单' : site.name }}
                <span v-if="site.aliasRule" class="text-blue-600 dark:text-blue-400">· 自定义</span>
              </div>
            </div>
            <span class="muted text-xs">{{ site.tabCount }}</span>
          </button>
        </li>
        <li v-if="!webSites.length" class="muted px-4 py-6 text-center text-sm">没有打开的网页</li>
      </ul>
    </aside>
  </div>
</template>
