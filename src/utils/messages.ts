import { browser } from 'wxt/browser';
import type { GroupResolution } from './grouping';

export interface SearchTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  groupTitle?: string;
  groupColor?: string;
}

export type WindowAction = 'regroup' | 'ungroupAll' | 'collapseAll' | 'expandAll';

/** 发往 background 的消息及其响应类型 */
export interface MessageMap {
  quickGroup: { request: { windowId?: number }; response: { ok: boolean } };
  windowAction: { request: { type: WindowAction; windowId?: number }; response: { ok: boolean } };
  getTabs: { request: {}; response: SearchTab[] };
  activateTab: { request: { tabId: number; windowId: number }; response: { ok: boolean } };
  closeTab: { request: { tabId: number }; response: { ok: boolean } };
  resolveUrl: { request: { url: string }; response: GroupResolution };
}

export type MessageAction = keyof MessageMap;
export type Message<A extends MessageAction = MessageAction> = { action: A } & MessageMap[A]['request'];

/** 发往 content script 的消息 */
export type ContentMessage = { action: 'toggleTabSearch' };

function isIgnorableError(error: unknown): boolean {
  const message = (error as Error)?.message ?? String(error);
  return (
    message.includes('Extension context invalidated') ||
    message.includes('message port closed') ||
    message.includes('Receiving end does not exist')
  );
}

/** 向 background 发送消息；扩展被重载/更新导致的上下文失效时返回 null 而不是抛错 */
export async function sendMessage<A extends MessageAction>(
  action: A,
  payload: MessageMap[A]['request'] = {} as MessageMap[A]['request'],
): Promise<MessageMap[A]['response'] | null> {
  try {
    return (await browser.runtime.sendMessage({ action, ...payload })) ?? null;
  } catch (error) {
    if (isIgnorableError(error)) return null;
    throw error;
  }
}
