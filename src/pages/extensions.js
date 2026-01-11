/**
 * 扩展白名单管理页面
 * 用于管理哪些扩展不参与自动分组
 */

// 获取扩展白名单
function getExtensionWhitelist() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['extensionWhitelist'], (result) => {
      resolve(result.extensionWhitelist || []);
    });
  });
}

// 保存扩展白名单
function saveExtensionWhitelist(whitelist) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ extensionWhitelist: whitelist }, resolve);
  });
}

// 切换扩展的白名单状态
async function toggleExtensionWhitelist(extensionId) {
  const whitelist = await getExtensionWhitelist();
  const index = whitelist.indexOf(extensionId);

  if (index > -1) {
    // 从白名单移除
    whitelist.splice(index, 1);
  } else {
    // 添加到白名单
    whitelist.push(extensionId);
  }

  await saveExtensionWhitelist(whitelist);
  return whitelist;
}

// 获取扩展图标 URL
function getExtensionIconUrl(icons, isSpecial = false) {
  // 特殊项使用自定义图标
  if (isSpecial) {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234caf50"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"/></svg>';
  }
  
  if (!icons || icons.length === 0) {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm10 16H4V8h16v12z"/></svg>';
  }

  // 优先使用较大的图标
  const sortedIcons = icons.sort((a, b) => b.size - a.size);
  return sortedIcons[0].url;
}

// 渲染扩展列表
async function renderExtensions() {
  try {
    const extensions = await chrome.management.getAll();
    const whitelist = await getExtensionWhitelist();
    const extensionsList = document.getElementById('extensionsList');
    const emptyState = document.getElementById('emptyState');

    // 过滤掉当前扩展本身，只显示其他扩展
    const currentExtensionId = chrome.runtime.id;
    const otherExtensions = extensions.filter(ext =>
      ext.id !== currentExtensionId && ext.type === 'extension'
    );
    
    // 添加特殊项：新标签页
    const specialItems = [
      {
        id: 'newtab',
        name: '新标签页',
        description: '浏览器新标签页（edge://newtab/ 或 chrome://newtab/）',
        icons: [],
        isSpecial: true
      }
    ];
    
    const allItems = [...specialItems, ...otherExtensions];

    extensionsList.style.display = 'grid';
    emptyState.style.display = 'none';

    // 更新统计信息
    document.getElementById('totalCount').textContent = allItems.length;
    document.getElementById('whitelistCount').textContent = whitelist.length;

    // 排序：白名单中的项排在前面
    const sortedItems = allItems.sort((a, b) => {
      const aInWhitelist = whitelist.includes(a.id);
      const bInWhitelist = whitelist.includes(b.id);
      
      if (aInWhitelist && !bInWhitelist) return -1;
      if (!aInWhitelist && bInWhitelist) return 1;
      
      // 同类型按名称排序
      return a.name.localeCompare(b.name);
    });

    // 清空列表
    extensionsList.innerHTML = '';

    // 渲染每个项（包括特殊项和扩展）
    sortedItems.forEach(item => {
      const isInWhitelist = whitelist.includes(item.id);
      const extensionItem = createExtensionItem(item, isInWhitelist);
      extensionsList.appendChild(extensionItem);
    });

  } catch (error) {
    console.error('渲染扩展列表失败:', error);
  }
}

// 创建扩展项 DOM 元素
function createExtensionItem(extension, isInWhitelist) {
  const div = document.createElement('div');
  div.className = `extension-item ${isInWhitelist ? 'in-whitelist' : ''}`;

  // 扩展图标容器
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'extension-icon-wrapper';

  // 扩展图标
  const icon = document.createElement('img');
  icon.className = 'extension-icon';
  icon.src = getExtensionIconUrl(extension.icons, extension.isSpecial);
  icon.alt = extension.name;
  icon.onerror = function() {
    this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="gray"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm10 16H4V8h16v12z"/></svg>';
  };

  // 白名单标记
  if (isInWhitelist) {
    const badge = document.createElement('div');
    badge.className = 'toggle-badge';
    badge.innerHTML = '✓';
    iconWrapper.appendChild(badge);
  }

  iconWrapper.appendChild(icon);

  // 扩展名称
  const nameDiv = document.createElement('div');
  nameDiv.className = 'extension-name';
  nameDiv.textContent = extension.name;

  // 组装元素
  div.appendChild(iconWrapper);
  div.appendChild(nameDiv);

  // 点击事件
  div.addEventListener('click', async () => {
    await toggleExtensionWhitelist(extension.id);
    await renderExtensions();
  });

  return div;
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  renderExtensions();

  // 监听存储变化，实时更新
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.extensionWhitelist) {
      renderExtensions();
    }
  });
});
