import { browser } from 'wxt/browser';

export type GroupSortMode = 'default' | 'name' | 'append';

/** 跨设备同步的数据（chrome.storage.sync），键名与 2.x 版本保持兼容 */
export interface SyncData {
  /** 不参与分组的域名，匹配自身及其所有子域名 */
  whitelist: string[];
  /** 自定义分组：{ 分组名: [域名...] } */
  groupNames: Record<string, string[]>;
  /** 不参与分组的扩展 ID（特殊值 newtab 表示新标签页） */
  extensionWhitelist: string[];
}

/** 本机设置（chrome.storage.local） */
export interface LocalSettings {
  subdomainEnabled: boolean;
  groupTop: boolean;
  groupSortMode: GroupSortMode;
  accordion: boolean;
  extensionReplace: boolean;
  clearGroupedTabs: boolean;
  enableNewtabGrouping: boolean;
  enableTabSearch: boolean;
  tabSearchKey: string;
  /** 同名标签达到该数量才建组 */
  minGroupSize: number;
}

export type Settings = SyncData & LocalSettings;

export const SYNC_DEFAULTS: SyncData = {
  whitelist: [],
  groupNames: {},
  extensionWhitelist: [],
};

export const LOCAL_DEFAULTS: LocalSettings = {
  subdomainEnabled: false,
  groupTop: false,
  groupSortMode: 'default',
  accordion: false,
  extensionReplace: false,
  clearGroupedTabs: false,
  enableNewtabGrouping: false,
  enableTabSearch: true,
  tabSearchKey: 'Shift',
  minGroupSize: 2,
};

export const DEFAULTS: Settings = { ...SYNC_DEFAULTS, ...LOCAL_DEFAULTS };

export const SYNC_KEYS = Object.keys(SYNC_DEFAULTS) as (keyof SyncData)[];
export const LOCAL_KEYS = Object.keys(LOCAL_DEFAULTS) as (keyof LocalSettings)[];

export function areaOf(key: keyof Settings): 'sync' | 'local' {
  return (SYNC_KEYS as string[]).includes(key) ? 'sync' : 'local';
}

export async function loadSettings(): Promise<Settings> {
  const [sync, local] = await Promise.all([
    browser.storage.sync.get(SYNC_KEYS),
    browser.storage.local.get(LOCAL_KEYS),
  ]);
  return { ...structuredClone(DEFAULTS), ...sync, ...local } as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const sync: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    (areaOf(key as keyof Settings) === 'sync' ? sync : local)[key] = value;
  }
  await Promise.all([
    Object.keys(sync).length ? browser.storage.sync.set(sync) : null,
    Object.keys(local).length ? browser.storage.local.set(local) : null,
  ]);
}

/** 读-改-写同一个键，避免多个页面之间互相覆盖 */
export async function updateSetting<K extends keyof Settings>(
  key: K,
  updater: (current: Settings[K]) => Settings[K],
): Promise<Settings[K]> {
  const area = areaOf(key);
  const result = await browser.storage[area].get(key);
  const current = (result[key] ?? structuredClone(DEFAULTS[key])) as Settings[K];
  const next = updater(current);
  await browser.storage[area].set({ [key]: next });
  return next;
}

export function addToWhitelist(domain: string) {
  return updateSetting('whitelist', (list) => (list.includes(domain) ? list : [...list, domain]));
}

export function removeFromWhitelist(domain: string) {
  return updateSetting('whitelist', (list) => list.filter((d) => d !== domain));
}

/** 把域名归入某个分组（同时从其他分组移除，保证一个域名只属于一个分组） */
export function assignDomainToGroup(domain: string, groupName: string) {
  return updateSetting('groupNames', (groups) => {
    const next: Record<string, string[]> = {};
    for (const [name, domains] of Object.entries(groups)) {
      const rest = domains.filter((d) => d !== domain);
      if (rest.length || name === groupName) next[name] = rest;
    }
    next[groupName] = [...(next[groupName] ?? []), domain];
    return next;
  });
}

export function removeDomainFromGroups(domain: string) {
  return updateSetting('groupNames', (groups) => {
    const next: Record<string, string[]> = {};
    for (const [name, domains] of Object.entries(groups)) {
      const rest = domains.filter((d) => d !== domain);
      if (rest.length) next[name] = rest;
    }
    return next;
  });
}
