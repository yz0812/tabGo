/**
 * Chrome Extension Background Script
 * 用于管理浏览器标签页分组的扩展
 */

// 监听器设置
chrome.windows.onCreated.addListener(clearGroupedTabs);
chrome.runtime.onInstalled.addListener(initializeContextMenus);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.runtime.onMessage.addListener(handleMessage);

// 域名后缀
let commonTLDs = [];

// 在扩展启动时加载域名列表
async function loadTLDs() {
  try {
    const response = await fetch(chrome.runtime.getURL('domain.txt'));
    const text = await response.text();
    commonTLDs = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'));
    
    console.log(`Loaded ${commonTLDs.length} TLDs`);
  } catch (error) {
    console.error('Error loading TLDs:', error);
  }
}

// 在后台脚本(background.js)中：
let globalAliases = null;

// 在扩展启动时加载
chrome.runtime.onInstalled.addListener(async () => {
  globalAliases = await loadAliases();
});

// 加载并解析 aliases.json
async function loadAliases() {
  try {
    const response = await fetch(chrome.runtime.getURL('aliases.json'));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const aliases = await response.json();
    
    // 创建一个映射对象，用于快速查找
    const urlAliasMap = new Map(aliases.map(item => [item.domain, item.name]));
    
    return {
      aliases,       // 原始数组
      urlAliasMap   // Map对象，用于快速查找
    };
  } catch (error) {
    console.error('Error loading aliases.json:', error);
    return {
      aliases: [],
      urlAliasMap: new Map()
    };
  }
}

// 在扩展启动时调用加载函数
loadTLDs();

/**
 * 初始化右键菜单
 */
function initializeContextMenus() {
  const menuItems = [
    { id: "addWhitelist", title: "添加到白名单" },
    { id: "manageGroupName", title: "设置分组名称" },
    { id: "quickGroup", title: "快速分组" }
  ];

  menuItems.forEach(item => {
    chrome.contextMenus.create({
      id: item.id,
      title: item.title,
      contexts: ["all"]
    });
  });
}

/**
 * 处理标签页更新
 */
function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete") {
    // tab 对象包含 windowId，直接传给 groupTabs
    groupTabs(tab.windowId);
  }
}

/**
 * 处理标签页激活
 */
function handleTabActivation(activeInfo) {
  // activeInfo 包含 windowId
  chrome.tabs.get(activeInfo.tabId, tab => {
    // 同时也只处理当前窗口的折叠逻辑
    collapseOtherTabGroups(tab).catch(console.error);
  });
  // 激活通常不需要重新分组，除非你有特殊需求，如果需要也只处理当前窗口
  // groupTabs(activeInfo.windowId); 
}

/**
 * 处理标签页移除
 */
function handleTabRemoval(tabId, removeInfo) {
  if (!removeInfo.isWindowClosing) {
    // removeInfo 包含 windowId
    groupTabs(removeInfo.windowId);
  }
}

/**
 * 处理存储变更
 * @param {object} changes - 变更对象
 */
function handleStorageChange(changes) {
  const handlers = {
    subdomainEnabled: () => {
      ungroupAllTabs();
      groupTabs();
    },
    groupTop: newValue => {
      if (newValue) reorderTabsAndGroups();
    },
    groupNames: () => groupTabs(),
    accordion: handleAccordionChange,
    extensionReplace: newValue => extensionReplace(newValue)
  };

  Object.keys(changes).forEach(key => {
    if (handlers[key]) {
      handlers[key](changes[key].newValue);
    }
  });
}

/**
 * 处理扩展消息
 * @param {object} message - 消息对象
 * @param {object} sender - 发送者信息
 * @param {function} sendResponse - 响应函数
 */
function handleMessage(message, sender, sendResponse) {
  if (message.action === "quickGroup") {
    // 如果消息来自某个标签页，sender.tab.windowId 存在
    // 如果是全局快捷键，可能需要获取当前窗口
    const targetWindowId = sender.tab ? sender.tab.windowId : null;
    groupTabs(targetWindowId).then(() => {
      sendResponse({ status: "Tabs grouped successfully" });
    });
    return true; 
  }
}

/**
 * 处理右键菜单点击
 * @param {object} info - 点击信息
 * @param {object} tab - 标签页对象
 */
function handleContextMenuClick(info, tab) {
  debugger
  const handlers = {
    addWhitelist: () => {
      const url = new URL(tab.url);
      addToWhitelist(url.hostname);
      alert(`${url.hostname} 已添加到白名单`);
    },
    quickGroup: () => groupTabs(),
    manageGroupName: () => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: "promptForGroupName" },
        response => {
          // 检查是否有运行时错误
          if (chrome.runtime.lastError) {
            // 创建一个通知或弹窗
            // TODO 在edge的性能模式下面 浏览器页面长久为刷新会进入未激活状态这个时候没有办法弹出sendMessage  没有办法弹出提示sendMessage
            //handleSendMessageError(chrome.runtime.lastError.message);
            //return;
          }

          if (response?.groupName && response?.domain) {
            setGroupName(response.domain, response.groupName);
            groupTabs();
          }
        }
      );
    }
  };

  if (handlers[info.menuItemId]) {
    handlers[info.menuItemId]();
  }
}


function handleSendMessageError(error) {
  // 使用 Chrome 通知
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'path/to/icon.png', // 确保有扩展图标
    title: '页面操作错误',
    message: error || '页面未激活，请刷新重试'
  });

  // 记录错误
  console.error('Message sending error:', error);
}


/**
 * 处理手风琴模式变更
 * @param {boolean} newValue - 新的手风琴模式状态
 */
async function handleAccordionChange(newValue) {
  if (newValue) {
    const activeTab = await getActiveTab();
    if (activeTab) {
      await collapseOtherTabGroups(activeTab);
    }
  } else {
    await expandAllTabGroups();
  }
}

/**
 * 获取存储中的值
 * @param {string} key - 存储键
 * @param {string} storageArea - 存储区域 ('sync' 或 'local')
 * @returns {Promise<any>} 存储的值
 */
function getStorageValue(key, storageArea = 'local') {
  return new Promise((resolve, reject) => {
    chrome[`storage`][storageArea].get([key], result => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Error getting ${key}: ${chrome.runtime.lastError}`));
      } else {
        resolve(result[key]);
      }
    });
  });
}

/**
 * 获取子域名启用状态
 * @returns {Promise<boolean>}
 */
function getSubdomainEnabled() {
  return getStorageValue('subdomainEnabled').then(value => value || false);
}

/**
 * 获取分组置顶状态
 * @returns {Promise<boolean>}
 */
function getGroupTop() {
  return getStorageValue('groupTop').then(value => value || false);
}

/**
 * 获取手风琴模式状态
 * @returns {Promise<boolean>}
 */
function getAccordionEnabled() {
  return getStorageValue('accordion').then(value => value || false);
}

/**
 * 获取扩展名称替换映射
 * @returns {Promise<Object>}
 */
function getExtensionReplaceMap() {
  return getStorageValue('extensionReplaceMap').then(value => value || {});
}

/**
 * 获取白名单
 * @returns {Promise<Array>}
 */
function getWhitelist() {
  return getStorageValue('whitelist', 'sync').then(value => value || []);
}

/**
 * 获取分组名称
 * @returns {Promise<Object>}
 */
function getGroupNames() {
  return getStorageValue('groupNames', 'sync').then(value => value || {});
}

/**
 * 获取当前激活的标签页
 * @returns {Promise<chrome.tabs.Tab>}
 */
function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs[0] || null);
    });
  });
}

/**
 * 获取是否启动时关闭分组数据
 * @returns {Promise<Object>}
 */
function getClearGroupedTabs() {
  return getStorageValue("clearGroupedTabs").then((value) => value || false);
}

/**
 * 将域名添加到白名单
 * @param {string} domain - 域名
 */
function addToWhitelist(domain) {
  getWhitelist().then(whitelist => {
    if (!whitelist.includes(domain)) {
      const newWhitelist = [...whitelist, domain];
      chrome.storage.sync.set({ whitelist: newWhitelist });
    }
  });
}

/**
 * 设置分组名称
 * @param {string} domain - 域名
 * @param {string} newGroupName - 新的分组名称
 */
async function setGroupName(domain, newGroupName) {
  const [groupNames, subdomainEnabled] = await Promise.all([
    getGroupNames(),
    getSubdomainEnabled()
  ]);
  // 获取域名或者IP
  const targetDomain = getNormalizedDomain(domain,subdomainEnabled);

  if (!groupNames[newGroupName]) {
    groupNames[newGroupName] = [];
  }
  if (!groupNames[newGroupName].includes(targetDomain)) {
    groupNames[newGroupName].push(targetDomain);
  }

  await chrome.storage.sync.set({ groupNames });
}

/**
 * 处理扩展名称替换
 * @param {boolean} enabled - 是否启用扩展名称替换
 */
function extensionReplace(enabled) {
  if (enabled) {
    chrome.management.getAll(extensions => {
      const extensionMap = extensions.reduce((map, ext) => {
        map[ext.id] = ext.name;
        return map;
      }, {});
      chrome.storage.local.set({ extensionReplaceMap: extensionMap });
    });
  } else {
    chrome.storage.local.remove('extensionReplaceMap');
  }
}

/**
 * 取消所有标签页的分组
 */
async function ungroupAllTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const ungroupPromises = tabs
    .filter(tab => tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    .map(tab => 
      chrome.tabs.ungroup(tab.id).catch(err => 
        console.error(`Error ungrouping tab ${tab.id}:`, err)
      )
    );
  
  await Promise.all(ungroupPromises);
}


/**
 * 主要的标签分组逻辑
 * @param {number|null} targetWindowId - 指定要处理的窗口ID，如果为null则处理所有窗口
 */
async function groupTabs(targetWindowId = null) {
  try {
    let windows = [];
    
    if (targetWindowId) {
      // 如果指定了窗口，只处理这一个
      // 我们构造一个包含 id 的对象即可，不需要完整的 window 对象
      windows = [{ id: targetWindowId }];
    } else {
      // 只有在初始化或更改全局设置时，才处理所有窗口
      windows = await chrome.windows.getAll();
    }
    
    // 对每个窗口单独处理
    for (const window of windows) {
      const [
        tabs,
        tabGroups,
        localIsEnabled,
        whitelist,
        groupNames,
        extensionReplaceMap,
        extensionReplace
      ] = await Promise.all([
        chrome.tabs.query({ windowId: window.id }),
        chrome.tabGroups.query({ windowId: window.id }),
        getSubdomainEnabled(),
        getWhitelist(),
        getGroupNames(),
        getExtensionReplaceMap(),
        getStorageValue('extensionReplace')
      ]);

      const { groups, existingGroupsMap } = await processAndGroupTabs(
        tabs, 
        tabGroups,
        {
          localIsEnabled,
          whitelist,
          groupNames,
          extensionReplaceMap,
          extensionReplace
        }
      );

      // 【关键修改】将 window.id 传递给 updateTabGroups
      await updateTabGroups(groups, existingGroupsMap, window.id);
      
      const groupTop = await getGroupTop();
      if (groupTop) {
        await reorderTabsAndGroups(window.id);
      }
    }

  } catch (error) {
    console.error("Error in groupTabs:", error);
  }
}

/**
 * 处理和分组标签页
 * @param {Array<chrome.tabs.Tab>} tabs - 标签页数组
 * @param {Array<chrome.tabGroups.TabGroup>} existingGroups - 现有分组数组
 * @param {Object} options - 配置选项
 * @returns {Object} 分组结果
 */
function processAndGroupTabs(tabs, existingGroups, options) {
  const { localIsEnabled, whitelist, groupNames, extensionReplaceMap, extensionReplace } = options;
  const groups = {};
  const existingGroupsMap = {};

  existingGroups.forEach(group => {
    if (group.title) {
      existingGroupsMap[group.title] = group.id;
    }
  });

  tabs.forEach(tab => {
    try {
      const url = new URL(tab.url);
      
      // 跳过浏览器内置页面
      if (url.protocol === "chrome:" || url.protocol === "about:") return;

      const groupInfo = determineGroupInfo(url, {
        localIsEnabled,
        whitelist,
        groupNames,
        extensionReplaceMap,
        extensionReplace
      });

      if (groupInfo) {
        if (!groups[groupInfo.name]) {
          groups[groupInfo.name] = [];
        }
        groups[groupInfo.name].push(tab);
      }
    } catch (e) {
      console.error("Error processing tab:", tab.url, e);
    }
  });

  return { groups, existingGroupsMap };
}

/**
 * 决定标签页的分组信息
 * @param {URL} url - 标签页URL
 * @param {Object} options - 配置选项
 * @returns {Object|null} 分组信息或null
 */
function determineGroupInfo(url, options) {
  const { localIsEnabled, whitelist, groupNames, extensionReplaceMap, extensionReplace } = options;

  const domainParts = url.hostname.split(".");
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname);
  
  let targetDomain = isIP ? url.hostname : 
    localIsEnabled ? url.hostname : domainParts.slice(-2).join(".");

  // 检查白名单
  if (whitelist.some(domain => targetDomain.includes(domain))) {
    return null;
  }

  let groupName = targetDomain;

  // 处理扩展页面
  if (extensionReplace && url.protocol.includes('extension')) {
    const extensionId = url.hostname;
    groupName = extensionReplaceMap[extensionId] || extensionId;
  } else if (url.protocol === 'edge:'|| url.protocol === 'chrome:') {
    // 处理Edge特殊页面
    for (const [domain, name] of globalAliases.urlAliasMap.entries()) {
      if (url.origin.startsWith(domain)) {
        groupName = name;
      }
    }
  }

  // 应用自定义分组名称
  for (const [customGroupName, domains] of Object.entries(groupNames)) {
    if (domains.includes(targetDomain)) {
      groupName = customGroupName;
      break;
    }
  }

  groupName = processDomainName(groupName);
  return { name: groupName };
}





/**
* 处理域名，如果是常见域名格式则去除后缀
* @param {string} groupName - 要处理的字符串
* @returns {string} - 处理后的字符串
*/
function processDomainName(groupName) {
  // 如果输入为空，直接返回
  if (!groupName) return groupName;
  
  // 移除可能存在的协议前缀（http:// 或 https://）
  let cleanName = groupName.replace(/^(https?:\/\/)?/, '');
  
  // 移除可能存在的 www. 前缀
  cleanName = cleanName.replace(/^www\./, '');
  
  // 分割域名部分
  const parts = cleanName.split('.');
  
  // 如果只有一个部分，说明不是域名格式，直接返回
  if (parts.length === 1) return groupName;
  
  // 获取最后一个部分作为可能的顶级域名
  const possibleTLD = parts[parts.length - 1].toLowerCase();
  
  // 如果最后一部分是常见顶级域名
  if (commonTLDs.includes(possibleTLD)) {
      // 返回去除顶级域名的部分
      return parts.slice(0, -1).join('.');
  }
  
  // 如果不是常见域名格式，返回原始输入
  return groupName;
}

/**
 * 更新标签组
 * @param {Object} groups - 分组对象
 * @param {Object} existingGroupsMap - 现有分组映射
 */
async function updateTabGroups(groups, existingGroupsMap, windowId) {
  for (const [groupName, groupTabs] of Object.entries(groups)) {
    if (groupTabs.length <= 1) {
      if (groupTabs.length === 1) {
        await chrome.tabs.ungroup(groupTabs[0].id).catch(console.error);
      }
      continue;
    }

    const tabIds = groupTabs.map(tab => tab.id);
    
    if (existingGroupsMap[groupName]) {
      // 更新现有分组
      await chrome.tabs.group({
        tabIds,
        groupId: existingGroupsMap[groupName]
      }).catch(console.error);
    } else {
      // 创建新分组
      // 【关键修复】：显式指定 createProperties: { windowId }
      // 这强制浏览器在指定窗口创建新组，而不是合并到其他窗口的同名组
      const groupId = await chrome.tabs.group({ 
        tabIds,
        createProperties: { windowId: windowId } 
      }).catch(console.error);

      if (groupId) {
        await chrome.tabGroups.update(groupId, { title: groupName }).catch(console.error);
      }
    }
  }
}

/**
 * 重新排序标签页和分组，确保分组在固定标签页之后，未分组标签在最后
 * @returns {Promise<void>}
 */
async function reorderTabsAndGroups(windowId) {
  try {
    // 使用传入的 windowId 而不是获取当前窗口
    const window = await chrome.windows.get(windowId, { populate: true });
    
    // 获取指定窗口的所有标签页
    const allTabs = await chrome.tabs.query({ windowId: windowId });
    
    const pinnedTabsCount = allTabs.filter(tab => tab.pinned).length;
    
    // 获取指定窗口的所有标签组
    const allGroups = await chrome.tabGroups.query({ windowId: windowId });
    
    // 其余代码保持不变...
    allGroups.sort((a, b) => a.id - b.id);
    
    let currentIndex = pinnedTabsCount;
    
    for (const group of allGroups) {
      const groupTabs = await chrome.tabs.query({
        windowId: windowId,
        groupId: group.id,
        pinned: false
      });
      
      if (groupTabs.length > 0) {
        await chrome.tabGroups.move(group.id, { index: currentIndex });
        
        for (const tab of groupTabs) {
          await chrome.tabs.move(tab.id, { index: currentIndex });
          currentIndex++;
        }
      }
    }
    
    const ungroupedTabs = await chrome.tabs.query({
      windowId: windowId,
      groupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
      pinned: false
    });
    
    const movePromises = ungroupedTabs.map(tab => 
      chrome.tabs.move(tab.id, { index: -1 })
        .catch(err => console.error(`Error moving ungrouped tab ${tab.id}:`, err))
    );
    
    await Promise.all(movePromises);
    
    console.log('Reordering completed successfully');
  } catch (error) {
    console.error("Error in reorderTabsAndGroups:", error);
  }
}

/**
 * 展开所有标签组
 * @returns {Promise<string>}
 */
async function expandAllTabGroups() {
  try {
    const window = await chrome.windows.getCurrent({ populate: true });
    const groups = await chrome.tabGroups.query({ windowId: window.id });
    
    const expandPromises = groups.map(group =>
      chrome.tabGroups.update(group.id, { collapsed: false })
        .catch(err => console.warn(`展开标签组 ${group.id} 时出错:`, err))
    );
    
    await Promise.all(expandPromises);
    return `已尝试展开 ${groups.length} 个标签组`;
  } catch (error) {
    console.error("Error in expandAllTabGroups:", error);
    throw error;
  }
}

/**
 * 折叠指定的标签组
 * @param {number} groupId - 标签组ID
 * @param {number} retryCount - 重试次数
 * @returns {Promise<void>}
 */
async function collapseTabGroup(groupId, retryCount = 0) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 100;

  try {
    await chrome.tabGroups.update(groupId, { collapsed: true });
  } catch (error) {
    if (retryCount < MAX_RETRIES && 
        error.message.includes("Tabs cannot be edited right now")) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      return collapseTabGroup(groupId, retryCount + 1);
    }
    throw error;
  }
}

/**
 * 折叠除当前标签外的其他标签组
 * @param {chrome.tabs.Tab} currentTab - 当前标签页
 * @returns {Promise<void>}
 */
async function collapseOtherTabGroups(currentTab) {
  try {
    const accordionEnabled = await getAccordionEnabled();
    if (!accordionEnabled) return;

    const groups = await chrome.tabGroups.query({ windowId: currentTab.windowId });
    
    const collapsePromises = groups
      .filter(group => group.id !== currentTab.groupId && !group.collapsed)
      .map(group => collapseTabGroup(group.id).catch(err => {
        console.error(`Error collapsing group ${group.id}:`, err);
      }));
    
    await Promise.all(collapsePromises);
  } catch (error) {
    console.error("Error in collapseOtherTabGroups:", error);
  }
}

/**
 * 检查URL是否为特殊页面
 * @param {string} url - URL字符串
 * @returns {boolean} 是否为特殊页面
 */
function isSpecialPage(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "chrome:" || 
           urlObj.protocol === "about:" || 
           urlObj.protocol === "edge:";
  } catch {
    return false;
  }
}

/**
 * 获取标准化的域名
 * @param {string} hostname - 主机名
 * @param {boolean} useSubdomain - 是否使用子域名
 * @returns {string} 标准化的域名
 */
function getNormalizedDomain(hostname, useSubdomain) {
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (isIP) return hostname;
  
  const parts = hostname.split('.');
  return useSubdomain ? hostname : parts.slice(-2).join('.');
}

// 错误处理工具函数
const errorHandler = {
  /**
   * 包装 Chrome API 调用
   * @param {Function} chromeApiCall - Chrome API 调用函数
   * @returns {Promise} Promise对象
   */
  wrapChromeApi: function(chromeApiCall) {
    return new Promise((resolve, reject) => {
      try {
        chromeApiCall((result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 记录错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  logError: function(error, context) {
    console.error(`Error in ${context}:`, error);
  }
};

/**
 * 关闭所有分组标签
 * @param {Error} error
 * @param {string} context
 */
async function clearGroupedTabs() {
  const isClearGroupedTabs = await getClearGroupedTabs();
  if (!isClearGroupedTabs) return;
  
    try {
      const tabGroups = await chrome.tabGroups.query({});

      const closeTabPromises = [];

      for (const group of tabGroups) {
        const groupTabs = await chrome.tabs.query({ groupId: group.id });

        for (const tab of groupTabs) {
          await chrome.tabs.ungroup(tab.id);
          closeTabPromises.push(chrome.tabs.remove(tab.id));
        }
      }

      await Promise.all(closeTabPromises);
      console.log("All grouped tabs closed on window open.");
    } catch (error) {
      console.error("Error removing grouped tabs on window open:", error);
    }
  
}
