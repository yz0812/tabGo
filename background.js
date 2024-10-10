/**
 * Chrome Extension Background Script
 * 用于管理浏览器标签页分组的扩展
 */

// 监听器设置
chrome.runtime.onInstalled.addListener(initializeContextMenus);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.runtime.onMessage.addListener(handleMessage);

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
 * @param {number} tabId - 标签页ID
 * @param {object} changeInfo - 变更信息
 */
function handleTabUpdate(tabId, changeInfo) {
  if (changeInfo.status === "complete") {
    groupTabs();
  }
}

/**
 * 处理标签页激活
 * @param {object} activeInfo - 激活信息
 */
function handleTabActivation(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, tab => {
    collapseOtherTabGroups(tab).catch(console.error);
  });
}

/**
 * 处理标签页移除
 * @param {number} tabId - 标签页ID
 * @param {object} removeInfo - 移除信息
 */
function handleTabRemoval(tabId, removeInfo) {
  if (!removeInfo.isWindowClosing) {
    groupTabs();
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
    groupTabs().then(() => {
      sendResponse({ status: "Tabs grouped successfully" });
    });
    return true; // 保持消息通道开放
  }
}

/**
 * 处理右键菜单点击
 * @param {object} info - 点击信息
 * @param {object} tab - 标签页对象
 */
function handleContextMenuClick(info, tab) {
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

  const domainParts = domain.split(".");
  const targetDomain = subdomainEnabled ? domain : domainParts.slice(-2).join(".");

  const updatedGroupNames = {
    ...groupNames,
    [targetDomain]: newGroupName
  };

  await chrome.storage.sync.set({ groupNames: updatedGroupNames });
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
 */
async function groupTabs() {
  try {
    const [
      tabs,
      tabGroups,
      localIsEnabled,
      whitelist,
      groupNames,
      extensionReplaceMap,
      extensionReplace
    ] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
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

    await updateTabGroups(groups, existingGroupsMap);
    
    const groupTop = await getGroupTop();
    if (groupTop) {
      await reorderTabsAndGroups();
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
  } else if (url.protocol === 'edge:') {
    // 处理Edge特殊页面
    groupName = url.hostname.startsWith('extensions') ? '扩展程序管理' : 
                url.hostname.startsWith('settings') ? '浏览器设置' : 
                targetDomain;
  }

  // 应用自定义分组名称
  groupName = groupNames[targetDomain] || groupName;

  groupName = processDomainName(groupName);
  return { name: groupName };
}




// 常见顶级域名列表
const commonTLDs = [
  'com', 'net', 'org', 'edu', 'gov', 'mil',
  'top', 'xyz', 'app', 'dev', 'io', 'co',
  'info', 'biz', 'name', 'pro', 'cloud', 'me',
  'online', 'live', 'tech', 'site', 'website',
  // 国家顶级域名
  'cn', 'us', 'uk', 'ru', 'jp', 'de', 'fr', 'au'
];

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
async function updateTabGroups(groups, existingGroupsMap) {
  for (const [groupName, groupTabs] of Object.entries(groups)) {
    if (groupTabs.length <= 1) {
      // 移除单个标签的分组
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
      const groupId = await chrome.tabs.group({ tabIds }).catch(console.error);
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
async function reorderTabsAndGroups() {
  try {
    // 获取当前窗口及其所有标签页
    const window = await chrome.windows.getCurrent({ populate: true });
    
    // 获取所有标签页信息
    const allTabs = await chrome.tabs.query({ windowId: window.id });
    
    // 计算固定标签页的数量
    const pinnedTabsCount = allTabs.filter(tab => tab.pinned).length;
    
    // 获取所有标签组
    const allGroups = await chrome.tabGroups.query({ windowId: window.id });
    
    // 按组ID排序标签组
    allGroups.sort((a, b) => a.id - b.id);
    
    // 从固定标签后面开始排序
    let currentIndex = pinnedTabsCount;
    
    // 首先处理所有分组的标签
    for (const group of allGroups) {
      // 查询属于当前组的所有非固定标签
      const groupTabs = await chrome.tabs.query({
        windowId: window.id,
        groupId: group.id,
        pinned: false
      });
      
      if (groupTabs.length > 0) {
        // 移动整个标签组到正确的位置（固定标签之后）
        await chrome.tabGroups.move(group.id, { index: currentIndex });
        
        // 确保组内的标签都在正确的位置
        for (const tab of groupTabs) {
          await chrome.tabs.move(tab.id, { index: currentIndex });
          currentIndex++;
        }
      }
    }
    
    // 最后处理未分组的非固定标签
    const ungroupedTabs = await chrome.tabs.query({
      windowId: window.id,
      groupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
      pinned: false
    });
    
    // 创建移动未分组标签的Promise数组
    const movePromises = ungroupedTabs.map(tab => 
      chrome.tabs.move(tab.id, { index: -1 })
        .catch(err => console.error(`Error moving ungrouped tab ${tab.id}:`, err))
    );
    
    // 等待所有未分组标签移动完成
    await Promise.all(movePromises);
    
    console.log('Reordering completed successfully');
  } catch (error) {
    console.error("Error in reorderTabsAndGroups:", error);
    // 可以添加更详细的错误信息
    if (error.message.includes('pinned tabs')) {
      console.error("Error details: Some tabs are pinned and affecting the reordering process");
    }
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

