import { browser, type Browser } from 'wxt/browser';
import { colorForName } from '@/utils/colors';
import { compareGroupNames, getGroupKey } from '@/utils/domain';
import { createGroupContext, resolveGroup, type GroupContext, type GroupResolution } from '@/utils/grouping';
import type { ContentMessage, Message, MessageMap, SearchTab, WindowAction } from '@/utils/messages';
import { openDashboard } from '@/utils/navigation';
import { addToWhitelist, LOCAL_KEYS, loadSettings, SYNC_KEYS, type Settings } from '@/utils/settings';

type Tab = Browser.tabs.Tab;
type TabGroup = Browser.tabGroups.TabGroup;

const TAB_GROUP_ID_NONE = -1;
const DEBOUNCE_DELAY = 150;
const MRU_LIMIT = 100;

/** 这些设置变化后需要对所有窗口重新分组 */
const REGROUP_KEYS = new Set([
  'subdomainEnabled', 'groupTop', 'groupSortMode', 'groupNames', 'whitelist',
  'extensionWhitelist', 'extensionReplace', 'enableNewtabGrouping', 'minGroupSize',
]);
const SETTING_KEYS = new Set<string>([...SYNC_KEYS, ...LOCAL_KEYS]);

export default defineBackground(() => {
  // ---------------------------------------------------------------------------
  // 配置上下文：只在设置或扩展列表变化时重建，Service Worker 休眠后自动重新加载
  // ---------------------------------------------------------------------------
  let contextPromise: Promise<GroupContext> | null = null;

  function getContext(): Promise<GroupContext> {
    contextPromise ??= buildContext().catch((error) => {
      contextPromise = null;
      throw error;
    });
    return contextPromise;
  }

  async function buildContext(): Promise<GroupContext> {
    const settings = await loadSettings();
    const extensionNames = settings.extensionReplace ? await loadExtensionNames() : new Map<string, string>();
    return createGroupContext(settings, extensionNames);
  }

  async function loadExtensionNames(): Promise<Map<string, string>> {
    const extensions = await browser.management.getAll();
    return new Map(extensions.map((ext) => [ext.id, ext.name]));
  }

  function invalidateContext() {
    contextPromise = null;
  }

  // ---------------------------------------------------------------------------
  // 本次会话中由 TabGo 创建的分组；只有这些分组（或标题与规则一致的分组）才会被自动拆散，
  // 用户手动建立的分组不会被打乱
  // ---------------------------------------------------------------------------
  let managedGroupIds: Promise<Set<number>> | null = null;

  function getManagedGroupIds(): Promise<Set<number>> {
    managedGroupIds ??= browser.storage.session
      .get('managedGroupIds')
      .then((result) => new Set<number>((result.managedGroupIds as number[]) ?? []));
    return managedGroupIds;
  }

  async function markManaged(groupId: number) {
    const ids = await getManagedGroupIds();
    ids.add(groupId);
    await browser.storage.session.set({ managedGroupIds: [...ids] });
  }

  // ---------------------------------------------------------------------------
  // 调度：同一窗口的分组任务防抖 + 串行执行，避免并发操作导致状态错乱
  // ---------------------------------------------------------------------------
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const queues = new Map<number, Promise<void>>();

  function runExclusive(windowId: number, task: () => Promise<void>): Promise<void> {
    const previous = queues.get(windowId) ?? Promise.resolve();
    const next = previous.then(task).catch((error) => console.error(`[TabGo] 窗口 ${windowId} 分组失败:`, error));
    queues.set(windowId, next);
    void next.finally(() => {
      if (queues.get(windowId) === next) queues.delete(windowId);
    });
    return next;
  }

  function scheduleGroup(windowId: number | undefined) {
    if (windowId === undefined || windowId < 0) return;
    clearTimeout(timers.get(windowId));
    timers.set(
      windowId,
      setTimeout(() => {
        timers.delete(windowId);
        void runExclusive(windowId, () => groupWindow(windowId));
      }, DEBOUNCE_DELAY),
    );
  }

  async function groupAllWindows() {
    const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
    await Promise.all(windows.map((win) => runExclusive(win.id!, () => groupWindow(win.id!))));
  }

  /** 用户拖动标签时浏览器会拒绝修改，稍后重试 */
  async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const message = (error as Error)?.message ?? '';
        if (attempt >= retries || !message.includes('cannot be edited')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 核心分组逻辑：先计算目标状态，只对有变化的标签调用 API
  // ---------------------------------------------------------------------------
  async function groupWindow(windowId: number) {
    const ctx = await getContext();
    const { minGroupSize, groupSortMode, groupTop } = ctx.settings;
    const [tabs, groups, managedIds] = await Promise.all([
      browser.tabs.query({ windowId }),
      browser.tabGroups.query({ windowId }),
      getManagedGroupIds(),
    ]);

    const groupById = new Map(groups.map((group) => [group.id, group]));
    const groupByTitle = new Map<string, TabGroup>();
    for (const group of groups) {
      if (group.title && !groupByTitle.has(group.title)) groupByTitle.set(group.title, group);
    }

    const isManaged = (group: TabGroup | undefined, res: GroupResolution) =>
      !!group && (managedIds.has(group.id) || (!!group.title && group.title === res.managedName));

    const buckets = new Map<string, { tab: Tab; current?: TabGroup; res: GroupResolution }[]>();
    const toUngroup: number[] = [];

    for (const tab of tabs) {
      if (tab.pinned || tab.id === undefined) continue;
      const res = resolveGroup(tab.pendingUrl || tab.url, ctx);
      const current = tab.groupId !== TAB_GROUP_ID_NONE ? groupById.get(tab.groupId) : undefined;
      if (res.name) {
        let bucket = buckets.get(res.name);
        if (!bucket) buckets.set(res.name, (bucket = []));
        bucket.push({ tab, current, res });
      } else if (isManaged(current, res)) {
        toUngroup.push(tab.id);
      }
    }

    for (const [name, entries] of buckets) {
      const existing = groupByTitle.get(name);

      if (entries.length < minGroupSize) {
        // 数量不足：只把留在 TabGo 分组里的标签移出来
        for (const { tab, current, res } of entries) {
          if (current && (current === existing || isManaged(current, res))) toUngroup.push(tab.id!);
        }
        continue;
      }

      const missing = entries.filter(({ tab }) => tab.groupId !== existing?.id).map(({ tab }) => tab.id!);
      if (!missing.length) continue;

      if (existing) {
        await withRetry(() => browser.tabs.group({ groupId: existing.id, tabIds: missing as [number, ...number[]] }));
      } else {
        const groupId = await withRetry(() => browser.tabs.group({ tabIds: missing as [number, ...number[]], createProperties: { windowId } }));
        await withRetry(() => browser.tabGroups.update(groupId, { title: name, color: colorForName(name) }));
        await markManaged(groupId);
        if (groupSortMode === 'append') await withRetry(() => browser.tabGroups.move(groupId, { index: -1 }));
      }
    }

    if (toUngroup.length) {
      await withRetry(() => browser.tabs.ungroup(toUngroup as [number, ...number[]]));
    }

    if (groupTop || groupSortMode === 'name') {
      await reorderWindow(windowId, ctx.settings);
    }
  }

  /** 分组排在固定标签之后、未分组标签之前；名称模式下分组按名称排序。顺序已正确时不做任何移动 */
  async function reorderWindow(windowId: number, settings: Settings) {
    const [tabs, groups] = await Promise.all([
      browser.tabs.query({ windowId }),
      browser.tabGroups.query({ windowId }),
    ]);
    tabs.sort((a, b) => a.index - b.index);

    const firstIndex = new Map<number, number>();
    const sizes = new Map<number, number>();
    for (const tab of tabs) {
      if (tab.groupId === TAB_GROUP_ID_NONE) continue;
      if (!firstIndex.has(tab.groupId)) firstIndex.set(tab.groupId, tab.index);
      sizes.set(tab.groupId, (sizes.get(tab.groupId) ?? 0) + 1);
    }

    const ordered = groups
      .filter((group) => sizes.has(group.id))
      .sort((a, b) =>
        settings.groupSortMode === 'name'
          ? compareGroupNames(a.title ?? '', b.title ?? '')
          : firstIndex.get(a.id)! - firstIndex.get(b.id)!,
      );

    // 检查当前顺序是否已经符合预期
    const pinnedCount = tabs.filter((tab) => tab.pinned).length;
    let expectedIndex = pinnedCount;
    let alreadyOrdered = true;
    for (const group of ordered) {
      if (firstIndex.get(group.id) !== expectedIndex) {
        alreadyOrdered = false;
        break;
      }
      expectedIndex += sizes.get(group.id)!;
    }
    if (alreadyOrdered) return;

    let index = pinnedCount;
    for (const group of ordered) {
      await withRetry(() => browser.tabGroups.move(group.id, { index }));
      index += sizes.get(group.id)!;
    }
  }

  async function ungroupWindow(windowId: number) {
    const tabs = await browser.tabs.query({ windowId });
    const tabIds = tabs.filter((tab) => tab.groupId !== TAB_GROUP_ID_NONE).map((tab) => tab.id!);
    if (tabIds.length) await withRetry(() => browser.tabs.ungroup(tabIds as [number, ...number[]]));
  }

  async function setCollapsed(windowId: number, collapsed: boolean, exceptGroupId = TAB_GROUP_ID_NONE) {
    const groups = await browser.tabGroups.query({ windowId });
    await Promise.all(
      groups
        .filter((group) => group.id !== exceptGroupId && group.collapsed !== collapsed)
        .map((group) =>
          withRetry(() => browser.tabGroups.update(group.id, { collapsed })).catch((error) =>
            console.warn(`[TabGo] 更新分组 ${group.id} 折叠状态失败:`, error),
          ),
        ),
    );
  }

  async function forEachWindow(fn: (windowId: number) => Promise<void>) {
    const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
    await Promise.all(windows.map((win) => fn(win.id!)));
  }

  async function runWindowAction(type: WindowAction, windowId: number) {
    switch (type) {
      case 'regroup':
        return runExclusive(windowId, () => groupWindow(windowId));
      case 'ungroupAll':
        return runExclusive(windowId, () => ungroupWindow(windowId));
      case 'collapseAll':
        return setCollapsed(windowId, true);
      case 'expandAll':
        return setCollapsed(windowId, false);
    }
  }

  async function getTargetWindowId(windowId?: number): Promise<number> {
    if (windowId !== undefined) return windowId;
    const win = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
    return win.id!;
  }

  // ---------------------------------------------------------------------------
  // 最近访问的标签（MRU），保存在 session storage 中，Service Worker 休眠后不丢失
  // ---------------------------------------------------------------------------
  let recentTabs: Promise<number[]> | null = null;
  let saveRecentTimer: ReturnType<typeof setTimeout> | undefined;

  function getRecentTabs(): Promise<number[]> {
    recentTabs ??= browser.storage.session.get('recentTabs').then((result) => (result.recentTabs as number[]) ?? []);
    return recentTabs;
  }

  async function updateRecentTabs(update: (list: number[]) => number[]) {
    const list = update(await getRecentTabs());
    recentTabs = Promise.resolve(list);
    clearTimeout(saveRecentTimer);
    saveRecentTimer = setTimeout(() => void browser.storage.session.set({ recentTabs: list }), 500);
  }

  async function getSearchTabs(senderTabId?: number): Promise<SearchTab[]> {
    const [tabs, groups, recent] = await Promise.all([
      browser.tabs.query({}),
      browser.tabGroups.query({}),
      getRecentTabs(),
    ]);
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const rank = new Map(recent.map((id, index) => [id, index]));
    const sorted = tabs.sort((a, b) => (rank.get(a.id!) ?? Infinity) - (rank.get(b.id!) ?? Infinity));
    // 当前标签放到最后，方便直接回车切换到上一个标签
    const senderIndex = sorted.findIndex((tab) => tab.id === senderTabId);
    if (senderIndex >= 0) sorted.push(...sorted.splice(senderIndex, 1));

    return sorted.map((tab) => {
      const group = groupById.get(tab.groupId);
      return {
        id: tab.id!,
        windowId: tab.windowId,
        title: tab.title || tab.url || '',
        url: tab.url || tab.pendingUrl || '',
        favIconUrl: tab.favIconUrl,
        active: tab.id === senderTabId,
        groupTitle: group?.title,
        groupColor: group?.color,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 启动时关闭分组标签（仅浏览器启动时执行一次）
  // ---------------------------------------------------------------------------
  async function closeGroupedTabsOnStartup() {
    const { settings } = await getContext();
    if (!settings.clearGroupedTabs) return;
    const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
    for (const win of windows) {
      const tabs = win.tabs ?? [];
      const grouped = tabs.filter((tab) => tab.groupId !== TAB_GROUP_ID_NONE).map((tab) => tab.id!);
      if (!grouped.length) continue;
      // 避免整个窗口被关闭
      if (grouped.length === tabs.length) await browser.tabs.create({ windowId: win.id, active: true });
      await browser.tabs.remove(grouped);
    }
  }

  async function flashBadge(tabId: number, text: string) {
    await browser.action.setBadgeBackgroundColor({ color: '#16a34a', tabId });
    await browser.action.setBadgeText({ text, tabId });
    setTimeout(() => void browser.action.setBadgeText({ text: '', tabId }).catch(() => {}), 2000);
  }

  // ---------------------------------------------------------------------------
  // 事件监听（必须在顶层同步注册，Service Worker 才能被事件唤醒）
  // ---------------------------------------------------------------------------
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    const webPages = ['http://*/*', 'https://*/*'];
    browser.contextMenus.create({ id: 'addWhitelist', title: '将此网站加入白名单', contexts: ['page'], documentUrlPatterns: webPages });
    browser.contextMenus.create({ id: 'manageGroupName', title: '为此网站设置分组名称…', contexts: ['page'], documentUrlPatterns: webPages });
    browser.contextMenus.create({ id: 'quickGroup', title: '立即分组当前窗口', contexts: ['page'] });
    // 2.x 遗留数据，扩展名称现在实时读取
    await browser.storage.local.remove('extensionReplaceMap');
    await groupAllWindows();
  });

  browser.runtime.onStartup.addListener(async () => {
    await closeGroupedTabsOnStartup();
    await groupAllWindows();
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if ('url' in changeInfo || 'pinned' in changeInfo || changeInfo.status === 'complete') {
      scheduleGroup(tab.windowId);
    }
  });
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    void updateRecentTabs((list) => list.filter((id) => id !== tabId));
    if (!removeInfo.isWindowClosing) scheduleGroup(removeInfo.windowId);
  });
  browser.tabs.onAttached.addListener((_tabId, info) => scheduleGroup(info.newWindowId));
  browser.tabs.onDetached.addListener((_tabId, info) => scheduleGroup(info.oldWindowId));

  browser.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    void updateRecentTabs((list) => [tabId, ...list.filter((id) => id !== tabId)].slice(0, MRU_LIMIT));
    const { settings } = await getContext();
    if (!settings.accordion) return;
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab) await setCollapsed(windowId, true, tab.groupId);
  });

  // 手风琴模式：手动展开一个分组时折叠同窗口的其他分组
  browser.tabGroups.onUpdated.addListener(async (group) => {
    if (group.collapsed) return;
    const { settings } = await getContext();
    if (settings.accordion) await setCollapsed(group.windowId, true, group.id);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session') return;
    const keys = Object.keys(changes).filter((key) => SETTING_KEYS.has(key));
    if (!keys.length) return;
    invalidateContext();
    if (keys.some((key) => REGROUP_KEYS.has(key))) void groupAllWindows();
    if (changes.accordion) {
      const enabled = !!changes.accordion.newValue;
      void forEachWindow(async (windowId) => {
        if (!enabled) return setCollapsed(windowId, false);
        const [active] = await browser.tabs.query({ windowId, active: true });
        await setCollapsed(windowId, true, active?.groupId);
      });
    }
  });

  const onExtensionsChanged = () => {
    invalidateContext();
    void getContext().then((ctx) => {
      if (ctx.settings.extensionReplace) return groupAllWindows();
    });
  };
  browser.management.onInstalled.addListener(onExtensionsChanged);
  browser.management.onUninstalled.addListener(onExtensionsChanged);

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    switch (info.menuItemId) {
      case 'addWhitelist': {
        const { settings } = await getContext();
        const hostname = new URL(info.pageUrl ?? tab.url!).hostname;
        await addToWhitelist(getGroupKey(hostname, settings.subdomainEnabled));
        await flashBadge(tab.id, '✓');
        break;
      }
      case 'manageGroupName': {
        const { settings } = await getContext();
        const hostname = new URL(info.pageUrl ?? tab.url!).hostname;
        await openDashboard(`/rules?domain=${encodeURIComponent(getGroupKey(hostname, settings.subdomainEnabled))}`);
        break;
      }
      case 'quickGroup':
        await runExclusive(tab.windowId, () => groupWindow(tab.windowId));
        break;
    }
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    const windowId = await getTargetWindowId(tab?.windowId);
    if (command === 'quick-group') await runExclusive(windowId, () => groupWindow(windowId));
    if (command === 'open-dashboard') await openDashboard();
    if (command === 'tab-search') {
      const [active] = await browser.tabs.query({ active: true, windowId });
      if (active?.id) {
        await browser.tabs.sendMessage(active.id, { action: 'toggleTabSearch' } satisfies ContentMessage).catch(() => openDashboard());
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 消息处理
  // ---------------------------------------------------------------------------
  const handlers: { [A in keyof MessageMap]: (message: Message<A>, sender: Browser.runtime.MessageSender) => Promise<MessageMap[A]['response']> } = {
    async quickGroup(message, sender) {
      const windowId = await getTargetWindowId(message.windowId ?? sender.tab?.windowId);
      await runExclusive(windowId, () => groupWindow(windowId));
      return { ok: true };
    },
    async windowAction(message, sender) {
      const windowId = await getTargetWindowId(message.windowId ?? sender.tab?.windowId);
      await runWindowAction(message.type, windowId);
      return { ok: true };
    },
    getTabs: (_message, sender) => getSearchTabs(sender.tab?.id),
    async activateTab({ tabId, windowId }) {
      await browser.tabs.update(tabId, { active: true });
      await browser.windows.update(windowId, { focused: true });
      return { ok: true };
    },
    async closeTab({ tabId }) {
      await browser.tabs.remove(tabId);
      return { ok: true };
    },
    async resolveUrl({ url }) {
      return resolveGroup(url, await getContext());
    },
  };

  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    const handler = handlers[message?.action] as ((m: Message, s: typeof sender) => Promise<unknown>) | undefined;
    if (!handler) return false;
    handler(message, sender).then(sendResponse, (error) => {
      console.error(`[TabGo] 处理消息 ${message.action} 失败:`, error);
      sendResponse(null);
    });
    return true;
  });
});
