chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "promptForGroupName") {
        const groupName = prompt("请输入分组名称:");
        // 传回当前的域名与分组名称
        sendResponse({ domain: window.location.hostname, groupName: groupName });
    }
});

// --- Tab Search Feature ---

class TabSearchUI {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.isVisible = false;
    this.tabs = [];
    this.filteredTabs = [];
    this.selectedIndex = 0;
    this.lastKey = null;
    this.lastTapTime = 0;
    this.searchEnabled = true; // Default true
    this.triggerKey = 'Shift'; // Default Shift
    this.fallbackFaviconDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3Qgd2lkdGg9IjEyIiBoZWlnaHQ9IjE0IiB4PSIyIiB5PSIxIiBmaWxsPSIjZTVlN2ViIiBzdHJva2U9IiM5Y2EzYWYiIHN0cm9rZS13aWR0aD0iMSIvPjxsaW5lIHgxPSI0IiB5MT0iNSIgeDI9IjEyIiB5Mj0iNSIgc3Ryb2tlPSIjOWNhM2FmIiBzdHJva2Utd2lkdGg9IjEiLz48bGluZSB4MT0iNCIgeTE9IjgiIHgyPSIxMiIgeTI9IjgiIHN0cm9rZT0iIzljYTNhZiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+';

    // Bind methods
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.close = this.close.bind(this);
    this.loadSettings = this.loadSettings.bind(this);

    this.init();
  }

  init() {
    this.loadSettings();
    document.addEventListener('keydown', this.handleGlobalKeyDown);

    // Listen for storage changes to update settings dynamically
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.enableTabSearch) {
                this.searchEnabled = changes.enableTabSearch.newValue;
                console.log('[TabGo] Search Enabled updated:', this.searchEnabled);
            }
            if (changes.tabSearchKey) {
                this.triggerKey = changes.tabSearchKey.newValue;
                console.log('[TabGo] Trigger Key updated:', this.triggerKey);
            }
        }
    });
  }

  loadSettings() {
      chrome.storage.local.get(['enableTabSearch', 'tabSearchKey'], (result) => {
          this.searchEnabled = result.enableTabSearch !== undefined ? result.enableTabSearch : true;
          this.triggerKey = result.tabSearchKey || 'Shift';
          console.log('[TabGo] Settings loaded:', { enabled: this.searchEnabled, key: this.triggerKey });
      });
  }

  isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  isIgnorableMessageError(error) {
    const message = error?.message || String(error);
    return message.includes('Extension context invalidated') ||
      message.includes('The message port closed before a response was received');
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            if (this.isIgnorableMessageError(chrome.runtime.lastError)) {
              resolve(null);
              return;
            }
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  handleGlobalKeyDown(e) {
    // Debug log
    // console.log('[TabGo] KeyDown:', e.key, 'Code:', e.code, 'Trigger:', this.triggerKey);

    if (!this.searchEnabled) return;
    if (this.isVisible) return; // Don't trigger if already visible (let input handle it)
    if (e.isComposing || this.isEditableTarget(e.target)) return;

    // --- 1. Check Combo Keys (Stateless) ---
    // Only if the configured key is a combo (contains '+')
    if (this.triggerKey.includes('+')) {
        const parts = this.triggerKey.split('+');
        const mainKey = parts.pop(); // Last part is the key code
        const modifiers = parts;

        const needsCtrl = modifiers.some(m => m === 'Ctrl' || m === 'Control');
        const needsAlt = modifiers.some(m => m === 'Alt');
        const needsShift = modifiers.some(m => m === 'Shift');
        const needsMeta = modifiers.some(m => m === 'Meta' || m === 'Command');

        // console.log('[TabGo] Checking Combo:', { mainKey, needsCtrl, needsAlt, needsShift });

        if (e.ctrlKey === needsCtrl &&
            e.altKey === needsAlt &&
            e.shiftKey === needsShift &&
            e.metaKey === needsMeta) {

            let pressedKey = e.key;
            if (pressedKey === ' ') pressedKey = 'Space';

            if (pressedKey.toLowerCase() === mainKey.toLowerCase()) {
                 console.log('[TabGo] Combo Matched!');
                 e.preventDefault();
                 this.toggle();
                 return;
            }
        }
    }

    // --- 2. Check Double Tap Keys (Stateful) ---
    // We strictly follow the configured key. No hardcoded 'Shift'.
    const keysToWatch = new Set();

    // If configured key is a single modifier (not a combo), add it
    if (!this.triggerKey.includes('+')) {
        let configKey = this.triggerKey.replace('Double ', '');
        keysToWatch.add(configKey);
    }

    // console.log('[TabGo] Keys to watch:', Array.from(keysToWatch));

    if (keysToWatch.has(e.key) && !e.repeat) {
        // Ensure only the target modifier is pressed
        const isCtrl = e.ctrlKey;
        const isAlt = e.altKey;
        const isMeta = e.metaKey;
        const isShift = e.shiftKey;

        // Check if "pure" (no other modifiers are pressed)
        let isPure = true;

        if (e.key === 'Shift' && (isCtrl || isAlt || isMeta)) isPure = false;
        else if (e.key === 'Control' && (isAlt || isMeta || isShift)) isPure = false;
        else if (e.key === 'Alt' && (isCtrl || isMeta || isShift)) isPure = false;
        // For strictness, if the key is not one of the standard modifiers we expect, treat as impure if any modifier is held
        else if (!['Shift', 'Control', 'Alt'].includes(e.key) && (isCtrl || isAlt || isMeta || isShift)) isPure = false;

        // console.log('[TabGo] Is Pure?', isPure, 'Key:', e.key);

        if (isPure) {
            const now = Date.now();
            const timeDiff = now - this.lastTapTime;

            // console.log('[TabGo] Tap Check:', { lastKey: this.lastKey, currentKey: e.key, timeDiff });

            // Reset if time gap is too large
            if (timeDiff > 500) {
                 this.lastKey = e.key;
                 this.lastTapTime = now;
                 return;
            }

            // Check if it's the second tap of the SAME key
            if (this.lastKey === e.key) {
                console.log('[TabGo] Double Tap Detected! Toggling UI...');
                this.toggle();
                this.lastKey = null;
                this.lastTapTime = 0;
            } else {
                // Different key pressed, restart sequence
                this.lastKey = e.key;
                this.lastTapTime = now;
            }
            return;
        }
    }

    // Reset double tap state if any other key is pressed
    // console.log('[TabGo] Resetting tap state due to other key');
    this.lastKey = null;
    this.lastTapTime = 0;
  }

  async toggle() {
    if (this.isVisible) {
      this.close();
    } else {
      await this.show();
    }
  }

  async show() {
    if (this.isVisible) return;

    // Create UI if not exists
    if (!this.host) {
      this.createUI();
    }

    // Fetch tabs
    try {
      const tabs = await this.sendMessage({ action: "getTabs" });
      if (tabs === null) return;
      this.tabs = Array.isArray(tabs) ? tabs : [];
      this.filteredTabs = this.tabs;
      this.selectedIndex = 0;
      this.renderList();
      this.isVisible = true;
      this.host.style.display = 'block';
      setTimeout(() => {
          const input = this.shadow.querySelector('input');
          if (input) {
              input.value = '';
              input.focus();
          }
      }, 50);

      // Prevent page scrolling
      // document.body.style.overflow = 'hidden'; // removed to avoid layout shift or conflict
    } catch (err) {
      if (this.isIgnorableMessageError(err)) return;
      console.error('Failed to get tabs:', err);
    }
  }

  close() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.host.style.display = 'none';
    // document.body.style.overflow = '';
  }

  createUI() {
    this.host = document.createElement('div');
    this.host.id = 'tabgo-search-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.2);
        font-family: system-ui, -apple-system, sans-serif;
      }
      .container {
        position: absolute;
        top: 20%;
        left: 50%;
        transform: translateX(-50%);
        width: 600px;
        max-width: 90%;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: fadeIn 0.1s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      .search-box {
        padding: 16px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
      }
      .search-icon {
        width: 20px;
        height: 20px;
        color: #9ca3af;
        margin-right: 12px;
      }
      input {
        flex: 1;
        font-size: 16px;
        border: none;
        outline: none;
        background: transparent;
        color: #111827;
      }
      .list {
        max-height: 300px; /* Approx 5 items (60px each) */
        overflow-y: auto;
        padding: 8px 0;
      }
      .item {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: background-color 0.1s;
      }
      .item.selected {
        background-color: #f3f4f6;
      }
      .item:hover {
        background-color: #f9fafb;
      }
      .favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        border-radius: 2px;
      }
      .content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .title {
        font-size: 14px;
        font-weight: 500;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .url {
        font-size: 12px;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: #e5e7eb;
        color: #4b5563;
        margin-left: 8px;
        flex-shrink: 0;
      }
      /* Scrollbar */
      .list::-webkit-scrollbar {
        width: 8px;
      }
      .list::-webkit-scrollbar-track {
        background: transparent;
      }
      .list::-webkit-scrollbar-thumb {
        background-color: #d1d5db;
        border-radius: 4px;
      }
      .list::-webkit-scrollbar-thumb:hover {
        background-color: #9ca3af;
      }
    `;

    const container = document.createElement('div');
    container.className = 'container';

    const searchBox = document.createElement('div');
    searchBox.className = 'search-box';

    // Search Icon SVG
    searchBox.innerHTML = `
      <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    `;

    const input = document.createElement('input');
    input.placeholder = 'Search tabs...';
    input.addEventListener('input', (e) => this.handleInput(e.target.value));
    input.addEventListener('keydown', this.handleKeyDown);

    const list = document.createElement('div');
    list.className = 'list';
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (item) {
        const index = parseInt(item.dataset.index);
        this.activateTab(this.filteredTabs[index]);
      }
    });

    searchBox.appendChild(input);
    container.appendChild(searchBox);
    container.appendChild(list);

    this.shadow.appendChild(style);
    this.shadow.appendChild(container);

    // Close on click outside
    this.host.addEventListener('click', (e) => {
      const path = e.composedPath();
      // 如果点击的是 host 本身（背景遮罩），则关闭
      // 如果点击的是内部元素（如 input, list），path[0] 会是内部元素，不等于 host
      if (path && path[0] === this.host) {
        this.close();
      }
    });

    document.body.appendChild(this.host);
  }

  handleInput(query) {
    if (!query) {
      this.filteredTabs = this.tabs;
    } else {
      const lowerQuery = query.toLowerCase();
      this.filteredTabs = this.tabs.filter(tab => {
        return (tab.title && tab.title.toLowerCase().includes(lowerQuery)) ||
               (tab.url && tab.url.toLowerCase().includes(lowerQuery));
      });
    }
    this.selectedIndex = 0;
    this.renderList();
  }

  handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredTabs.length - 1);
      this.renderList();
      this.scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.renderList();
      this.scrollToSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.filteredTabs[this.selectedIndex]) {
        this.activateTab(this.filteredTabs[this.selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  renderList() {
    const list = this.shadow.querySelector('.list');
    list.innerHTML = '';

    if (this.filteredTabs.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '16px';
        empty.style.textAlign = 'center';
        empty.style.color = '#6b7280';
        empty.textContent = 'No tabs found';
        list.appendChild(empty);
        return;
    }

    this.filteredTabs.forEach((tab, index) => {
      const item = document.createElement('div');
      item.className = `item ${index === this.selectedIndex ? 'selected' : ''}`;
      item.dataset.index = index;

      const favicon = document.createElement('img');
      favicon.className = 'favicon';
      if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome')) {
        favicon.src = tab.favIconUrl;
      } else {
        // Fallback or transparent
        favicon.src = this.fallbackFaviconDataUrl;
      }
      favicon.onerror = () => {
        favicon.src = this.fallbackFaviconDataUrl;
      };

      const content = document.createElement('div');
      content.className = 'content';

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = tab.title;

      const url = document.createElement('div');
      url.className = 'url';
      try {
          const urlObj = new URL(tab.url);
          url.textContent = urlObj.hostname + (urlObj.pathname.length > 1 ? urlObj.pathname : '');
      } catch (e) {
          url.textContent = tab.url;
      }

      content.appendChild(title);
      content.appendChild(url);

      item.appendChild(favicon);
      item.appendChild(content);
      list.appendChild(item);
    });
  }

  scrollToSelected() {
    const list = this.shadow.querySelector('.list');
    const selected = list.children[this.selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  async activateTab(tab) {
    try {
      const response = await this.sendMessage({
        action: "activateTab",
        tabId: tab.id,
        windowId: tab.windowId
      });
      if (response && response.status === "success") {
        this.close();
      } else {
        console.error('Failed to activate tab:', response);
      }
    } catch (err) {
      console.error('Failed to activate tab:', err);
    }
  }
}

// Initialize
new TabSearchUI();
