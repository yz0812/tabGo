import { onScopeDispose, reactive, ref, toRaw } from 'vue';
import { browser } from 'wxt/browser';
import { DEFAULTS, loadSettings, saveSettings, type Settings } from '@/utils/settings';

const settings = reactive<Settings>(structuredClone(DEFAULTS));
const loaded = ref(false);
let subscribers = 0;
let loading: Promise<void> | null = null;

function onChanged(changes: Record<string, { newValue?: unknown }>, area: string) {
  if (area === 'session') return;
  for (const [key, change] of Object.entries(changes)) {
    if (key in DEFAULTS) {
      (settings as Record<string, unknown>)[key] = change.newValue ?? structuredClone(DEFAULTS[key as keyof Settings]);
    }
  }
}

/** 页面内共享的响应式设置，自动与 chrome.storage 双向同步 */
export function useSettings() {
  if (subscribers++ === 0) browser.storage.onChanged.addListener(onChanged);
  onScopeDispose(() => {
    if (--subscribers === 0) browser.storage.onChanged.removeListener(onChanged);
  });

  loading ??= loadSettings().then((value) => {
    Object.assign(settings, value);
    loaded.value = true;
  });

  async function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value;
    await saveSettings({ [key]: JSON.parse(JSON.stringify(toRaw(value))) });
  }

  return { settings, loaded, set };
}
