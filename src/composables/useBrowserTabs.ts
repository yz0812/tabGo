import { computed, onScopeDispose, shallowRef } from 'vue';
import { browser, type Browser } from 'wxt/browser';
import { useSettings } from './useSettings';
import { createGroupContext, resolveGroup, type GroupResolution } from '@/utils/grouping';
import type { Settings } from '@/utils/settings';

export type Tab = Browser.tabs.Tab;
export type TabGroup = Browser.tabGroups.TabGroup;

export interface WindowView {
  id: number;
  focused: boolean;
  tabCount: number;
  groups: { group: TabGroup; tabs: Tab[] }[];
  ungrouped: Tab[];
}

export interface SiteEntry extends GroupResolution {
  key: string;
  label: string;
  favIconUrl?: string;
  tabCount: number;
  kind: 'web' | 'browser' | 'extension';
}

/** 浏览器中所有窗口 / 分组 / 标签的实时快照 */
export function useBrowserTabs() {
  const tabs = shallowRef<Tab[]>([]);
  const groups = shallowRef<TabGroup[]>([]);
  const focusedWindowId = shallowRef<number>();
  const extensionNames = shallowRef(new Map<string, string>());
  const { settings } = useSettings();
  const selfOrigin = browser.runtime.getURL('');

  async function refresh() {
    const [allTabs, allGroups, focused] = await Promise.all([
      browser.tabs.query({ windowType: 'normal' }),
      browser.tabGroups.query({}),
      browser.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined),
    ]);
    tabs.value = allTabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);
    groups.value = allGroups;
    focusedWindowId.value = focused?.id;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  };

  const events = [
    browser.tabs.onCreated, browser.tabs.onUpdated, browser.tabs.onRemoved, browser.tabs.onMoved,
    browser.tabs.onAttached, browser.tabs.onDetached, browser.tabGroups.onCreated,
    browser.tabGroups.onUpdated, browser.tabGroups.onRemoved, browser.tabGroups.onMoved,
    browser.windows.onFocusChanged,
  ] as { addListener(fn: () => void): void; removeListener(fn: () => void): void }[];
  events.forEach((event) => event.addListener(scheduleRefresh));
  onScopeDispose(() => {
    clearTimeout(timer);
    events.forEach((event) => event.removeListener(scheduleRefresh));
  });

  void refresh();
  void browser.management.getAll().then((list) => {
    extensionNames.value = new Map(list.map((ext) => [ext.id, ext.name]));
  });

  const windows = computed<WindowView[]>(() => {
    const groupById = new Map(groups.value.map((group) => [group.id, group]));
    const byWindow = new Map<number, WindowView>();
    for (const tab of tabs.value) {
      let view = byWindow.get(tab.windowId);
      if (!view) {
        view = { id: tab.windowId, focused: tab.windowId === focusedWindowId.value, tabCount: 0, groups: [], ungrouped: [] };
        byWindow.set(tab.windowId, view);
      }
      view.tabCount++;
      const group = groupById.get(tab.groupId);
      if (!group) {
        view.ungrouped.push(tab);
        continue;
      }
      const last = view.groups[view.groups.length - 1];
      if (last?.group.id === group.id) last.tabs.push(tab);
      else view.groups.push({ group, tabs: [tab] });
    }
    return [...byWindow.values()].sort((a, b) => Number(b.focused) - Number(a.focused));
  });

  /** 按分组键聚合当前打开的网站，用于快速添加规则 */
  const sites = computed<SiteEntry[]>(() => {
    const ctx = createGroupContext(JSON.parse(JSON.stringify(settings)) as Settings, extensionNames.value);
    const map = new Map<string, SiteEntry>();
    for (const tab of tabs.value) {
      const url = tab.url || tab.pendingUrl || '';
      if (url.startsWith(selfOrigin)) continue;
      const res = resolveGroup(url, ctx);
      if (!res.key) continue;
      const entry = map.get(res.key);
      if (entry) {
        entry.tabCount++;
        entry.favIconUrl ??= tab.favIconUrl;
        continue;
      }
      const kind = url.startsWith('http') ? 'web' : url.includes('extension:') ? 'extension' : 'browser';
      map.set(res.key, {
        ...res,
        key: res.key,
        label: kind === 'extension' ? extensionNames.value.get(res.key) ?? res.key : res.key,
        favIconUrl: tab.favIconUrl,
        tabCount: 1,
        kind,
      });
    }
    return [...map.values()].sort((a, b) => b.tabCount - a.tabCount || a.key.localeCompare(b.key));
  });

  return { tabs, groups, windows, sites, extensionNames, refresh };
}
