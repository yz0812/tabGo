import { GROUP_COLOR_HEX } from '@/utils/colors';
import { sendMessage, type SearchTab } from '@/utils/messages';
import css from './style.css?inline';

const MAX_RESULTS = 200;
const FALLBACK_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="1" width="12" height="14" rx="2" fill="#e5e7eb" stroke="#9ca3af"/><path d="M5 5h6M5 8h6M5 11h4" stroke="#9ca3af"/></svg>',
  );

const TEMPLATE = `
  <div class="backdrop"></div>
  <div class="panel" role="dialog" aria-label="TabGo 标签搜索">
    <div class="search">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      <input type="text" placeholder="搜索标签页：标题、网址或分组名，空格分隔多个关键词" spellcheck="false" autocomplete="off">
      <span class="count"></span>
    </div>
    <div class="list" role="listbox"></div>
    <div class="footer">
      <span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
      <span><kbd>Enter</kbd> 切换</span>
      <span><kbd>Ctrl</kbd>+<kbd>Del</kbd> 关闭标签</span>
      <span><kbd>Esc</kbd> 退出</span>
    </div>
  </div>`;

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname.length > 1 ? parsed.pathname : '');
  } catch {
    return url;
  }
}

/** 页面内的标签搜索浮层，首次使用时才创建 DOM */
export class TabSearchUI {
  private host: HTMLElement | null = null;
  private input!: HTMLInputElement;
  private list!: HTMLElement;
  private count!: HTMLElement;
  private tabs: (SearchTab & { haystack: string })[] = [];
  private results: SearchTab[] = [];
  private selected = 0;

  get isOpen(): boolean {
    return !!this.host?.hasAttribute('open');
  }

  async toggle() {
    if (this.isOpen) this.close();
    else await this.open();
  }

  async open() {
    const tabs = await sendMessage('getTabs');
    if (!tabs) return;
    this.tabs = tabs.map((tab) => ({
      ...tab,
      haystack: `${tab.title}\n${tab.url}\n${tab.groupTitle ?? ''}`.toLowerCase(),
    }));
    this.ensureDom();
    this.input.value = '';
    this.filter('');
    this.host!.setAttribute('open', '');
    this.input.focus();
  }

  close() {
    this.host?.removeAttribute('open');
  }

  destroy() {
    this.host?.remove();
    this.host = null;
  }

  private ensureDom() {
    if (this.host?.isConnected) return;
    const host = document.createElement('tabgo-search');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${css}</style>${TEMPLATE}`;
    this.input = shadow.querySelector('input')!;
    this.list = shadow.querySelector('.list')!;
    this.count = shadow.querySelector('.count')!;

    shadow.querySelector('.backdrop')!.addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.filter(this.input.value));
    this.input.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>('.item');
      if (!item) return;
      const index = Number(item.dataset.index);
      if (target.closest('.close')) void this.closeTab(index);
      else void this.activate(index);
    });
    this.list.addEventListener('mousemove', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('.item');
      if (item) this.select(Number(item.dataset.index), false);
    });
    // 浮层内的按键不要冒泡给页面，避免触发网页自身的快捷键
    for (const type of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }

    (document.body ?? document.documentElement).appendChild(host);
    this.host = host;
  }

  private filter(query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = terms.length
      ? this.tabs.filter((tab) => terms.every((term) => tab.haystack.includes(term)))
      : this.tabs;
    // 标题命中的排在前面，其余保持最近访问顺序
    if (terms.length) {
      const score = (tab: SearchTab) => terms.filter((term) => tab.title.toLowerCase().includes(term)).length;
      matched.sort((a, b) => score(b) - score(a));
    }
    this.results = matched.slice(0, MAX_RESULTS);
    this.selected = 0;
    this.render();
    this.count.textContent = `${matched.length} / ${this.tabs.length}`;
  }

  private render() {
    if (!this.results.length) {
      this.list.innerHTML = '<div class="empty">没有匹配的标签页</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    this.results.forEach((tab, index) => fragment.appendChild(this.createItem(tab, index)));
    this.list.replaceChildren(fragment);
  }

  private createItem(tab: SearchTab, index: number): HTMLElement {
    const item = document.createElement('div');
    item.className = index === this.selected ? 'item selected' : 'item';
    item.dataset.index = String(index);
    item.setAttribute('role', 'option');

    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.loading = 'lazy';
    favicon.src = tab.favIconUrl && /^(https?|data):/.test(tab.favIconUrl) ? tab.favIconUrl : FALLBACK_FAVICON;
    favicon.onerror = () => (favicon.src = FALLBACK_FAVICON);

    const content = document.createElement('div');
    content.className = 'content';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = tab.title;
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = displayUrl(tab.url);
    content.append(title, url);
    item.append(favicon, content);

    if (tab.active) {
      const chip = document.createElement('span');
      chip.className = 'chip current';
      chip.textContent = '当前';
      item.append(chip);
    } else if (tab.groupTitle) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tab.groupTitle;
      chip.style.background = GROUP_COLOR_HEX[tab.groupColor ?? 'grey'] ?? GROUP_COLOR_HEX.grey!;
      item.append(chip);
    }

    const close = document.createElement('button');
    close.className = 'close';
    close.title = '关闭标签页';
    close.textContent = '×';
    item.append(close);
    return item;
  }

  /** 只切换选中样式，不重建列表 */
  private select(index: number, scroll = true) {
    if (index === this.selected || index < 0 || index >= this.results.length) return;
    this.list.children[this.selected]?.classList.remove('selected');
    this.selected = index;
    const item = this.list.children[index];
    item?.classList.add('selected');
    if (scroll) item?.scrollIntoView({ block: 'nearest' });
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const last = this.results.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        this.select(this.selected >= last ? 0 : this.selected + 1);
        break;
      case 'ArrowUp':
        this.select(this.selected <= 0 ? last : this.selected - 1);
        break;
      case 'PageDown':
        this.select(Math.min(this.selected + 8, last));
        break;
      case 'PageUp':
        this.select(Math.max(this.selected - 8, 0));
        break;
      case 'Enter':
        void this.activate(this.selected);
        break;
      case 'Delete':
        if (!event.ctrlKey && !event.metaKey) return;
        void this.closeTab(this.selected);
        break;
      case 'Escape':
        this.close();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private async activate(index: number) {
    const tab = this.results[index];
    if (!tab) return;
    this.close();
    await sendMessage('activateTab', { tabId: tab.id, windowId: tab.windowId });
  }

  private async closeTab(index: number) {
    const tab = this.results[index];
    if (!tab) return;
    const response = await sendMessage('closeTab', { tabId: tab.id });
    if (!response?.ok) return;
    this.tabs = this.tabs.filter((t) => t.id !== tab.id);
    this.results.splice(index, 1);
    this.list.children[index]?.remove();
    // 重新编号并保持选中位置
    Array.from(this.list.children).forEach((el, i) => ((el as HTMLElement).dataset.index = String(i)));
    this.count.textContent = `${this.results.length} / ${this.tabs.length}`;
    if (!this.results.length) return this.render();
    this.selected = -1;
    this.select(Math.min(index, this.results.length - 1));
    if (tab.active) this.close();
  }
}
