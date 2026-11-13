import { browser } from 'wxt/browser';

/** 打开（或切换到已打开的）全屏控制台，hash 形如 /rules?domain=example.com */
export async function openDashboard(hash = '') {
  const base = browser.runtime.getURL('/options.html');
  const url = hash ? `${base}#${hash}` : base;
  const [existing] = await browser.tabs.query({ url: `${base}*` });
  if (existing?.id) {
    await browser.tabs.update(existing.id, { active: true, url });
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url });
  }
}

export const isEdge = navigator.userAgent.includes('Edg/');

/** 浏览器内置页面需要通过 tabs API 打开 */
export function openBrowserPage(path: string) {
  return browser.tabs.create({ url: `${isEdge ? 'edge' : 'chrome'}://${path}` });
}
