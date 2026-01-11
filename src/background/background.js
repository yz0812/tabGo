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

// 防抖状态管理
const pendingGroupTabs = new Map(); // windowId -> timeoutId
const DEBOUNCE_DELAY = 150; // 毫秒

// 配置缓存
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5000; // 5秒缓存有效期

// 在扩展启动时加载域名列表
async function loadTLDs() {
  try {
    const response = await fetch(chrome.runtime.getURL('assets/data/domain.txt'));
    const text = await response.text();
    commonTLDs = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'));
    
    console.log(`已加载 ${commonTLDs.length} 个顶级域名`);
  } catch (error) {
    console.error('加载顶级域名列表失败:', error);
  }
}

// 在后台脚本(background.js)中：
let globalAliases = null;
let newTabExtensionId = null;

// 在扩展启动时加载（不仅仅是安装时）
async function initializeAliases() {
  globalAliases = await loadAliases();
}

// 检测覆盖新标签页的扩展
async function detectNewTabExtension() {
  try {
    const extensions = await chrome.management.getAll();
    for (const ext of extensions) {
      if (ext.enabled && ext.type === 'extension') {
        // 检查扩展是否覆盖了新标签页
        // 通过检查扩展的 manifest 中的 chrome_url_overrides
        // 注意：Management API 不直接提供这个信息，我们需要另一种方法
        
        // 简单方法：检查扩展的 homepageUrl 或其他属性
        // 但最可靠的方法是让用户手动选择
      }
    }
  } catch (error) {
    console.error('检测新标签页扩展失败:', error);
  }
}

// 扩展安装时加载
chrome.runtime.onInstalled.addListener(initializeAliases);

// 加载并解析 aliases.json
async function loadAliases() {
  try {
    const response = await fetch(chrome.runtime.getURL('assets/data/aliases.json'));
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
    console.error('加载 aliases.json 失败:', error);
    return {
      aliases: [],
      urlAliasMap: new Map()
    };
  }
}

// 在扩展启动时调用加载函数
loadTLDs();
initializeAliases();

/**
 * 防抖包装的 groupTabs
 * @param {number|null} windowId - 窗口ID
 */
function debouncedGroupTabs(windowId) {
  const key = windowId || 'all';

  // 清除该窗口已有的待执行任务
  if (pendingGroupTabs.has(key)) {
    clearTimeout(pendingGroupTabs.get(key));
  }

  // 设置新的延迟执行
  const timeoutId = setTimeout(() => {
    pendingGroupTabs.delete(key);
    groupTabs(windowId);
  }, DEBOUNCE_DELAY);

  pendingGroupTabs.set(key, timeoutId);
}

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
    // tab 对象包含 windowId，直接传给 debouncedGroupTabs
    debouncedGroupTabs(tab.windowId);
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
    debouncedGroupTabs(removeInfo.windowId);
  }
}

/**
 * 处理存储变更
 * @param {object} changes - 变更对象
 */
function handleStorageChange(changes) {
  // 任何配置变更都使缓存失效
  invalidateConfigCache();

  const handlers = {
    subdomainEnabled: () => {
      ungroupAllTabs();
      groupTabs();
    },
    groupTop: newValue => {
      if (newValue) groupTabs();
    },
    groupSortMode: () => groupTabs(),
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
    console.error('消息发送失败:', error);
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
 * 获取分组排序模式
 * @returns {Promise<string>} 'default' | 'name' | 'time'
 */
function getGroupSortMode() {
  return getStorageValue('groupSortMode').then(value => value || 'default');
}

/**
 * 获取字符类型优先级（用于分组名称排序）
 * @param {string} char - 首字符
 * @returns {number} 优先级：0=中文，1=英文，2=数字，3=其他
 */
function getCharTypePriority(char) {
  if (!char) return 3;
  const code = char.charCodeAt(0);
  // 中文字符范围
  if (code >= 0x4e00 && code <= 0x9fff) return 0;
  // 英文字母
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return 1;
  // 数字
  if (code >= 48 && code <= 57) return 2;
  // 其他
  return 3;
}

/**
 * 分组名称比较函数
 * 排序规则：中文 > 英文 > 数字 > 其他，同类按首字母/拼音排序
 * @param {string} a - 分组名称A
 * @param {string} b - 分组名称B
 * @returns {number} 比较结果
 */
function compareGroupNames(a, b) {
  const priorityA = getCharTypePriority(a.charAt(0));
  const priorityB = getCharTypePriority(b.charAt(0));

  // 不同类型按优先级排序
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  // 同类型使用 localeCompare 进行排序（支持中文拼音排序）
  return a.localeCompare(b, 'zh-CN');
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
 * 获取扩展白名单
 * @returns {Promise<Array>}
 */
function getExtensionWhitelist() {
  return getStorageValue('extensionWhitelist', 'sync').then(value => value || []);
}

/**
 * 获取所有配置（带缓存）
 * @param {boolean} forceRefresh - 强制刷新缓存
 * @returns {Promise<Object>} 配置对象
 */
async function getAllConfig(forceRefresh = false) {
  const now = Date.now();

  // 缓存有效，直接返回
  if (!forceRefresh && configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache;
  }

  // 并行读取所有配置（合并原来的两个 Promise.all）
  const [
    subdomainEnabled,
    groupTop,
    groupSortMode,
    extensionReplaceMap,
    extensionReplace,
    enableNewtabGrouping,
    whitelist,
    groupNames,
    extensionWhitelist
  ] = await Promise.all([
    getSubdomainEnabled(),
    getGroupTop(),
    getGroupSortMode(),
    getExtensionReplaceMap(),
    getStorageValue('extensionReplace'),
    getStorageValue('enableNewtabGrouping'),
    getWhitelist(),
    getGroupNames(),
    getExtensionWhitelist()
  ]);

  // 预处理白名单为 Set（用于快速查找）
  const whitelistSet = new Set(whitelist);

  // 预处理 groupNames：构建 domain -> groupName 的反向映射
  const domainToGroupName = new Map();
  for (const [groupName, domains] of Object.entries(groupNames)) {
    for (const domain of domains) {
      domainToGroupName.set(domain, groupName);
    }
  }

  configCache = {
    subdomainEnabled,
    groupTop,
    groupSortMode,
    extensionReplaceMap,
    extensionReplace,
    enableNewtabGrouping,
    whitelist,
    groupNames,
    extensionWhitelist,
    // 预处理的数据结构
    whitelistSet,
    domainToGroupName
  };
  configCacheTime = now;

  return configCache;
}

/**
 * 使缓存失效（在 storage.onChanged 时调用）
 */
function invalidateConfigCache() {
  configCache = null;
  configCacheTime = 0;
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
        console.error(`取消标签页 ${tab.id} 分组失败:`, err)
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
    // 一次性获取所有配置（带缓存）
    const config = await getAllConfig();

    let windows = [];

    if (targetWindowId) {
      // 如果指定了窗口，只处理这一个
      windows = [{ id: targetWindowId }];
    } else {
      // 只有在初始化或更改全局设置时，才处理所有窗口
      windows = await chrome.windows.getAll();
    }

    // 对每个窗口单独处理
    for (const window of windows) {
      const [tabs, tabGroups] = await Promise.all([
        chrome.tabs.query({ windowId: window.id }),
        chrome.tabGroups.query({ windowId: window.id })
      ]);

      const { groups, existingGroupsMap } = await processAndGroupTabs(
        tabs,
        tabGroups,
        {
          localIsEnabled: config.subdomainEnabled,
          whitelist: config.whitelist,
          groupNames: config.groupNames,
          extensionReplaceMap: config.extensionReplaceMap,
          extensionReplace: config.extensionReplace,
          extensionWhitelist: config.extensionWhitelist,
          enableNewtabGrouping: config.enableNewtabGrouping,
          // 传递预处理的数据结构
          whitelistSet: config.whitelistSet,
          domainToGroupName: config.domainToGroupName
        }
      );

      await updateTabGroups(groups, existingGroupsMap, window.id, config.groupSortMode);

      // 如果开启了分组在前，或者设置了名称排序模式
      if (config.groupTop || config.groupSortMode === 'name') {
        await reorderTabsAndGroups(window.id, config.groupSortMode, config.groupTop);
      }
    }

  } catch (error) {
    console.error("标签页分组失败:", error);
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
  const { localIsEnabled, whitelist, groupNames, extensionReplaceMap, extensionReplace, extensionWhitelist, enableNewtabGrouping } = options;
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

      const groupInfo = determineGroupInfo(url, tab, {
        localIsEnabled,
        whitelist,
        groupNames,
        extensionReplaceMap,
        extensionReplace,
        extensionWhitelist,
        enableNewtabGrouping
      });

      if (groupInfo) {
        if (!groups[groupInfo.name]) {
          groups[groupInfo.name] = [];
        }
        groups[groupInfo.name].push(tab);
      }
    } catch (e) {
      console.error("处理标签页失败:", tab.url, e);
    }
  });

  return { groups, existingGroupsMap };
}

/**
 * 决定标签页的分组信息（优化版）
 * @param {URL} url - 标签页URL
 * @param {chrome.tabs.Tab} tab - 标签页对象
 * @param {Object} options - 配置选项
 * @returns {Object|null} 分组信息或null
 */
function determineGroupInfo(url, tab, options) {
  const {
    localIsEnabled,
    whitelist,
    groupNames,
    extensionReplaceMap,
    extensionReplace,
    extensionWhitelist,
    // 使用预处理的数据结构
    whitelistSet,
    domainToGroupName
  } = options;

  const domainParts = url.hostname.split(".");
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname);

  let targetDomain = isIP ? url.hostname :
    localIsEnabled ? url.hostname : domainParts.slice(-2).join(".");

  // 优化后的白名单检查：先用 Set 精确匹配，再检查包含关系
  if (whitelistSet && whitelistSet.has(targetDomain)) {
    return null;
  }

  // 对于包含关系检查，仍需遍历但使用 Set
  if (whitelistSet) {
    for (const whitelistedDomain of whitelistSet) {
      if (targetDomain.includes(whitelistedDomain) ||
          whitelistedDomain.includes(targetDomain)) {
        return null;
      }
    }
  }

  let groupName = targetDomain;

  // 检查特殊页面（如新标签页）
  // 对于 edge://newtab/ 或 chrome://newtab/
  if ((url.protocol === 'edge:' || url.protocol === 'chrome:') && url.hostname === 'newtab') {
    // 如果未开启新标签页分组，则不分组
    if (!options.enableNewtabGrouping) {
      return null;
    }

    // 如果开启了新标签页分组，但白名单中包含 "newtab"，也不分组
    if (extensionWhitelist && extensionWhitelist.includes('newtab')) {
      return null;
    }
  }

  // 处理扩展页面
  if (url.protocol.includes('extension')) {
    const extensionId = url.hostname;

    // 检查扩展白名单（优先检查，独立于 extensionReplace 设置）
    if (extensionWhitelist && extensionWhitelist.includes(extensionId)) {
      return null;
    }

    // 如果启用了扩展名称替换，使用扩展名称
    if (extensionReplace) {
      groupName = extensionReplaceMap[extensionId] || extensionId;
    } else {
      groupName = extensionId;
    }
  } else if (url.protocol === 'edge:' || url.protocol === 'chrome:') {
    // 处理 Edge/Chrome 特殊页面
    if (globalAliases && globalAliases.urlAliasMap) {
      // 构建完整的 URL 前缀用于匹配（不包含路径）
      const urlPrefix = `${url.protocol}//${url.hostname}`;

      for (const [domain, name] of globalAliases.urlAliasMap.entries()) {
        // 使用 URL 前缀匹配，这样 chrome://settings/privacy 也能匹配 chrome://settings
        if (urlPrefix === domain || urlPrefix.startsWith(domain + '/')) {
          groupName = name;
          break;
        }
      }
    }
  }

  // 优化后的自定义分组名称查找：使用 Map O(1) 查找
  if (domainToGroupName && domainToGroupName.has(targetDomain)) {
    groupName = domainToGroupName.get(targetDomain);
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
 * 更新标签组（优化版）
 * @param {Object} groups - 分组对象
 * @param {Object} existingGroupsMap - 现有分组映射
 * @param {number} windowId - 窗口ID
 * @param {string} sortMode - 排序模式
 */
async function updateTabGroups(groups, existingGroupsMap, windowId, sortMode = 'default') {
  const updateExistingPromises = [];
  const createNewTasks = [];
  const ungroupPromises = [];

  for (const [groupName, groupTabs] of Object.entries(groups)) {
    if (groupTabs.length <= 1) {
      // 单个标签不分组，收集 ungroup 操作
      if (groupTabs.length === 1) {
        ungroupPromises.push(
          chrome.tabs.ungroup(groupTabs[0].id).catch(console.error)
        );
      }
      continue;
    }

    const tabIds = groupTabs.map(tab => tab.id);

    if (existingGroupsMap[groupName]) {
      // 更新现有分组 - 可以并行
      updateExistingPromises.push(
        chrome.tabs.group({
          tabIds,
          groupId: existingGroupsMap[groupName]
        }).catch(console.error)
      );
    } else {
      // 创建新分组 - 需要串行（因为后续操作依赖 groupId）
      createNewTasks.push({ groupName, tabIds, windowId, sortMode });
    }
  }

  // 并行执行：ungroup 和 更新现有分组
  await Promise.all([...ungroupPromises, ...updateExistingPromises]);

  // 串行执行：创建新分组（Chrome API 限制，并行创建可能冲突）
  for (const task of createNewTasks) {
    try {
      const groupId = await chrome.tabs.group({
        tabIds: task.tabIds,
        createProperties: { windowId: task.windowId }
      });

      if (groupId) {
        await chrome.tabGroups.update(groupId, { title: task.groupName });

        if (task.sortMode === 'append') {
          await chrome.tabGroups.move(groupId, { index: -1 });
        }
      }
    } catch (error) {
      console.error(`创建分组 ${task.groupName} 失败:`, error);
    }
  }
}

/**
 * 重新排序标签页和分组，确保分组在固定标签页之后，未分组标签在最后（优化版）
 * @param {number} windowId - 窗口ID
 * @param {string} sortMode - 排序模式: 'default' | 'name' | 'append'
 * @param {boolean} groupTop - 是否分组在前
 * @returns {Promise<void>}
 */
async function reorderTabsAndGroups(windowId, sortMode = 'default', groupTop = false) {
  try {
    // 如果 groupTop 为 true，无论什么排序模式都需要执行分组在前的排序
    // 只有当 groupTop 为 false 且排序模式不是 'name' 时才跳过
    if (!groupTop && sortMode !== 'name') {
      return;
    }

    // 一次性获取所有标签页（包含 groupId 信息）
    const allTabs = await chrome.tabs.query({ windowId: windowId });
    const allGroups = await chrome.tabGroups.query({ windowId: windowId });

    // 名称排序：中文 > 英文 > 数字 > 其他
    if (sortMode === 'name') {
      allGroups.sort((a, b) => compareGroupNames(a.title || '', b.title || ''));
    }

    const pinnedTabsCount = allTabs.filter(tab => tab.pinned).length;

    // 预先构建分组到标签的映射（避免多次 query）
    const groupTabsMap = new Map();
    for (const tab of allTabs) {
      if (!tab.pinned && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        if (!groupTabsMap.has(tab.groupId)) {
          groupTabsMap.set(tab.groupId, []);
        }
        groupTabsMap.get(tab.groupId).push(tab);
      }
    }

    let currentIndex = pinnedTabsCount;

    // 按顺序移动分组
    for (const group of allGroups) {
      const groupTabs = groupTabsMap.get(group.id) || [];

      if (groupTabs.length > 0) {
        // 移动分组本身
        await chrome.tabGroups.move(group.id, { index: currentIndex });

        // 批量移动标签（Chrome API 支持数组）
        const tabIds = groupTabs.map(tab => tab.id);
        await chrome.tabs.move(tabIds, { index: currentIndex });

        currentIndex += groupTabs.length;
      }
    }

    // 未分组标签批量移动到最后
    const ungroupedTabs = allTabs.filter(
      tab => !tab.pinned && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
    );

    if (ungroupedTabs.length > 0) {
      const ungroupedTabIds = ungroupedTabs.map(tab => tab.id);
      await chrome.tabs.move(ungroupedTabIds, { index: -1 }).catch(console.error);
    }

    console.log('标签页排序完成');
  } catch (error) {
    console.error("标签页排序失败:", error);
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
    console.error("展开所有标签组失败:", error);
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
        console.error(`折叠标签组 ${group.id} 失败:`, err);
      }));
    
    await Promise.all(collapsePromises);
  } catch (error) {
    console.error("折叠其他标签组失败:", error);
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
    console.error(`${context} 执行出错:`, error);
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
      console.log("窗口打开时已关闭所有分组标签页");
    } catch (error) {
      console.error("窗口打开时关闭分组标签页失败:", error);
    }
  
}
