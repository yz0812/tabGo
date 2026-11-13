<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import SettingItem from '@/components/SettingItem.vue';
import ShortcutRecorder from '@/components/ShortcutRecorder.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { useSettings } from '@/composables/useSettings';
import { isEdge, openBrowserPage } from '@/utils/navigation';
import type { GroupSortMode } from '@/utils/settings';

defineProps<{ query: URLSearchParams }>();

const { settings, set } = useSettings();

const sortModes: { value: GroupSortMode; label: string }[] = [
  { value: 'default', label: '保持原位' },
  { value: 'name', label: '按名称排序' },
  { value: 'append', label: '新分组放到末尾' },
];
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <section>
      <div class="section-title mb-2 px-1">分组规则</div>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700">
        <SettingItem title="按子域名分组" description="开启后 mail.google.com 与 drive.google.com 分别成组；关闭时按主域名合并为 google">
          <ToggleSwitch :model-value="settings.subdomainEnabled" @update:model-value="set('subdomainEnabled', $event)" />
        </SettingItem>
        <SettingItem title="成组的最少标签数" description="同一网站的标签数量达到该值时才建立分组">
          <select
            class="input w-24"
            :value="settings.minGroupSize"
            @change="set('minGroupSize', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }} 个</option>
          </select>
        </SettingItem>
      </div>
    </section>

    <section>
      <div class="section-title mb-2 px-1">排列与显示</div>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700">
        <SettingItem title="分组排在最前" description="分组标签紧跟在固定标签之后，未分组的标签排在最后">
          <ToggleSwitch :model-value="settings.groupTop" @update:model-value="set('groupTop', $event)" />
        </SettingItem>
        <SettingItem title="分组排序" description="按名称排序时：中文 > 英文 > 数字，并自动将分组排在最前">
          <select
            class="input w-36"
            :value="settings.groupSortMode"
            @change="set('groupSortMode', ($event.target as HTMLSelectElement).value as GroupSortMode)"
          >
            <option v-for="mode in sortModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
          </select>
        </SettingItem>
        <SettingItem title="手风琴模式" description="切换到某个分组或展开某个分组时，自动折叠同一窗口的其他分组">
          <ToggleSwitch :model-value="settings.accordion" @update:model-value="set('accordion', $event)" />
        </SettingItem>
        <SettingItem title="浏览器启动时关闭已分组的标签" description="仅在浏览器启动时执行一次，适合把分组当作临时工作区的用法">
          <ToggleSwitch :model-value="settings.clearGroupedTabs" @update:model-value="set('clearGroupedTabs', $event)" />
        </SettingItem>
      </div>
    </section>

    <section>
      <div class="section-title mb-2 px-1">标签搜索与快捷键</div>
      <div class="card divide-y divide-slate-100 dark:divide-slate-700">
        <SettingItem title="页面内标签搜索" description="在网页中按快捷键呼出搜索框，快速切换或关闭任意窗口的标签">
          <ToggleSwitch :model-value="settings.enableTabSearch" @update:model-value="set('enableTabSearch', $event)" />
        </SettingItem>
        <SettingItem
          v-if="settings.enableTabSearch"
          title="搜索快捷键"
          description="单独按一个修饰键表示连按两次触发（如双击 Shift），也可以录制组合键（如 Alt+K）"
        >
          <ShortcutRecorder :model-value="settings.tabSearchKey" @update:model-value="set('tabSearchKey', $event)" />
        </SettingItem>
        <SettingItem
          title="全局快捷键"
          description="立即分组、打开控制台、打开标签搜索（在浏览器内置页面也可用）可以在浏览器的扩展快捷键页面中设置"
        >
          <button class="btn btn-secondary" @click="openBrowserPage('extensions/shortcuts')">
            <AppIcon name="keyboard" />
            {{ isEdge ? 'Edge' : 'Chrome' }} 快捷键设置
          </button>
        </SettingItem>
      </div>
    </section>
  </div>
</template>
