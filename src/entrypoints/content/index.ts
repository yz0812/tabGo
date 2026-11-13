import { browser } from 'wxt/browser';
import type { ContentMessage } from '@/utils/messages';
import { LOCAL_DEFAULTS } from '@/utils/settings';
import { TabSearchUI } from './TabSearchUI';

const DOUBLE_TAP_WINDOW = 400;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

interface Shortcut {
  /** 单个修饰键表示"连按两次"触发 */
  doubleTap?: string;
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** 解析快捷键配置：'Shift' -> 双击 Shift；'Ctrl+Shift+K' -> 组合键 */
function parseShortcut(value: string): Shortcut {
  const parts = value.replace(/^Double /, '').split('+');
  if (parts.length === 1 && MODIFIER_KEYS.has(parts[0]!)) return { doubleTap: parts[0] };
  const key = parts.pop() ?? '';
  return {
    key: key === 'Space' ? ' ' : key.toLowerCase(),
    ctrl: parts.includes('Ctrl') || parts.includes('Control'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    meta: parts.includes('Meta') || parts.includes('Command'),
  };
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main(ctx) {
    const ui = new TabSearchUI();
    let enabled = LOCAL_DEFAULTS.enableTabSearch;
    let shortcut = parseShortcut(LOCAL_DEFAULTS.tabSearchKey);
    let lastTapKey: string | null = null;
    let lastTapTime = 0;

    void browser.storage.local.get(['enableTabSearch', 'tabSearchKey']).then((result) => {
      enabled = (result.enableTabSearch as boolean | undefined) ?? LOCAL_DEFAULTS.enableTabSearch;
      shortcut = parseShortcut((result.tabSearchKey as string | undefined) || LOCAL_DEFAULTS.tabSearchKey);
    });

    const onStorageChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local') return;
      if (changes.enableTabSearch) enabled = (changes.enableTabSearch.newValue as boolean | undefined) ?? true;
      if (changes.tabSearchKey) shortcut = parseShortcut((changes.tabSearchKey.newValue as string) || LOCAL_DEFAULTS.tabSearchKey);
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    const onMessage = (message: ContentMessage) => {
      if (message?.action === 'toggleTabSearch') void ui.toggle();
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.addEventListener(
      document,
      'keydown',
      (event) => {
        if (!enabled || ui.isOpen || event.isComposing || event.repeat) return;

        if (shortcut.key) {
          if (isEditable(event.target)) return;
          const matched =
            event.key.toLowerCase() === shortcut.key &&
            event.ctrlKey === !!shortcut.ctrl &&
            event.altKey === !!shortcut.alt &&
            event.shiftKey === !!shortcut.shift &&
            event.metaKey === !!shortcut.meta;
          if (matched) {
            event.preventDefault();
            void ui.open();
          }
          return;
        }

        // 双击修饰键：只有"单独按下"该修饰键才计数，其他任何按键都会重置
        const pureTap =
          event.key === shortcut.doubleTap &&
          [
            ['Control', event.ctrlKey],
            ['Alt', event.altKey],
            ['Shift', event.shiftKey],
            ['Meta', event.metaKey],
          ].every(([name, pressed]) => name === event.key || !pressed);

        if (!pureTap || isEditable(event.target)) {
          lastTapKey = null;
          return;
        }
        const now = performance.now();
        if (lastTapKey === event.key && now - lastTapTime < DOUBLE_TAP_WINDOW) {
          lastTapKey = null;
          void ui.open();
        } else {
          lastTapKey = event.key;
          lastTapTime = now;
        }
      },
      { capture: true },
    );

    // 扩展被重载或更新后清理，避免旧脚本继续响应按键
    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      ui.destroy();
    });
  },
});
