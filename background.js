chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "addWhitelist",
    title: "添加到白名单",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "quickGroup",
    title: "快速分组",
    contexts: ["all"],
  });
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 检查页面是否已加载完成
  if (changeInfo.status === "complete") {
    // 调用 groupTabs 函数
    groupTabs();
  }
});

// 关闭事件
chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
  // 判断标签页是否是窗口关闭导致的
  if (!removeInfo.isWindowClosing) {
    // 调用 groupTabs 函数
    groupTabs();
  }
});

// 监听 switch 状态的变化
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (changes.subdomainEnabled) {
    const newValue = changes.subdomainEnabled.newValue;
    ungroupAllTabs();
    groupTabs();
  }

  if (changes.groupTop) {
    const newValue = changes.groupTop.newValue;
    if (newValue) {
      reorderTabsAndGroups();
    }
  }
});

// 在background script中监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "quickGroup") {
    groupTabs(); // 调用你的快速分组逻辑
    sendResponse({ status: "Tabs grouped successfully" });
  }
});

// 白名单存储和读取
function getWhitelist(callback) {
  chrome.storage.sync.get(["whitelist"], function (result) {
    callback(result.whitelist || []);
  });
}

// 读取 subdomainEnabled 的状态
// function getSubdomainEnabled(callback) {
//   // 从 chrome.storage.local 中读取 subdomainEnabled
//   chrome.storage.local.get(['subdomainEnabled'], function(result) {
//     // 如果存在 subdomainEnabled，则返回其值；否则返回 false 作为默认值
//     const isEnabled = result.subdomainEnabled !== undefined ? result.subdomainEnabled : false;
//     callback(isEnabled);
//   });
//}

function getSubdomainEnabled() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["subdomainEnabled"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Error getting subdomainEnabled: ${chrome.runtime.lastError}`
          )
        );
      } else {
        const isEnabled =
          result.subdomainEnabled !== undefined
            ? result.subdomainEnabled
            : false;
        resolve(isEnabled);
      }
    });
  });
}

function getGroupTop() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["groupTop"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`Error getting groupTop: ${chrome.runtime.lastError}`)
        );
      } else {
        const isEnabled =
          result.groupTop !== undefined ? result.groupTop : false;
        resolve(isEnabled);
      }
    });
  });
}

function addToWhitelist(domain) {
  getWhitelist(function (whitelist) {
    if (!whitelist.includes(domain)) {
      whitelist.push(domain);
      chrome.storage.sync.set({ whitelist: whitelist });
    }
  });
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addWhitelist") {
    const url = new URL(tab.url);
    const domain = url.hostname;
    addToWhitelist(domain);
    alert(`${domain} 已添加到白名单`);
  } else if (info.menuItemId === "quickGroup") {
    groupTabs();
  }
});

async function groupTabs() {
  let localIsEnabled = await getSubdomainEnabled();

  // 获取白名单
  getWhitelist(function (whitelist) {
    chrome.tabs.query({}, function (tabs) {
      let groups = {}; // 用于存储每个域名的标签ID
      let existingGroups = {}; // 存储已经存在的分组ID

      // 获取已存在的标签分组
      chrome.tabGroups.query({}, (tabGroups) => {
        tabGroups.forEach((group) => {
          // 使用分组标题作为键，存储已有分组的ID
          if (group.title) {
            existingGroups[group.title] = group.id;
          }
        });

        // 遍历所有标签页，根据域名分组
        tabs.forEach((tab) => {
          try {
            const url = new URL(tab.url);

            // 跳过 Chrome 内置页面，例如 chrome:// 和 about://
            if (url.protocol === "chrome:" || url.protocol === "about:") {
              return; // 跳过内置页面
            }

            // 不开启子域名
            // 提取一级域名进行白名单匹配
            const domainParts = url.hostname.split(".");
            let topLevelDomain = domainParts;
            if (!localIsEnabled) {
              topLevelDomain = domainParts.slice(-2).join("."); // 提取一级域名
            }

            // 检查是否是 IP 地址
            const ipRegex =
              /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){2}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (ipRegex.test(url.hostname)) {
              topLevelDomain = url.hostname;
            }
            // 如果域名在白名单中，跳过该标签页的分组
            if (whitelist.includes(topLevelDomain)) {
              return;
            }

            // 使用简化后的URL作为分组名称（例如：example.com）
            let groupName = topLevelDomain;

            if (!groups[groupName]) {
              groups[groupName] = [];
            }

            groups[groupName].push(tab);
          } catch (e) {
            console.error("Error parsing URL:", tab.url, e);
          }
        });

        // 遍历每个分组的标签
        Object.keys(groups).forEach((groupName) => {
          const groupTabs = groups[groupName];

          // 如果某个分组的标签页数量大于1才进行分组
          if (groupTabs.length > 1) {
            const tabIds = groupTabs.map((tab) => tab.id);

            // 检查是否已有分组存在
            if (existingGroups[groupName]) {
              // 如果分组已存在，直接将标签页移动到该分组
              chrome.tabs.group(
                { tabIds: tabIds, groupId: existingGroups[groupName] },
                () => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      "Failed to move tabs to existing group:",
                      chrome.runtime.lastError
                    );
                  }
                }
              );
            } else {
              // 否则创建新分组
              chrome.tabs.group({ tabIds: tabIds }, (groupId) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Failed to group tabs:",
                    chrome.runtime.lastError
                  );
                  return;
                }

                // 确保分组标题不为空，并设置默认标题
                const groupTitle = groupName || "新分组";

                // 更新分组的标题，只在新建时设置
                if (groupId) {
                  chrome.tabGroups.update(
                    groupId,
                    { title: groupTitle },
                    () => {
                      if (chrome.runtime.lastError) {
                        console.error(
                          "Failed to update tab group title:",
                          chrome.runtime.lastError
                        );
                      }
                    }
                  );
                } else {
                  console.error("Invalid groupId");
                }
              });
            }
          } else {
            // 把当前标签页移动到分组外面

            const tabId = groupTabs[0].id;
            chrome.tabs.ungroup(tabId, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Failed to ungroup tab:",
                  chrome.runtime.lastError
                );
              }
            });
          }
        });

        // 移出只有一个标签页的分组
        chrome.tabGroups.query({}, function (tabGroups) {
          tabGroups.forEach((group) => {
            chrome.tabs.query({ groupId: group.id }, function (groupTabs) {
              if (groupTabs.length === 1) {
                // 只有一个标签页，将该标签页移出分组
                chrome.tabs.ungroup(groupTabs[0].id, function () {
                  // console.log("Tab " + groupTabs[0].id + " has been ungrouped from a group with only one tab.");
                });
              }
            });
          });
        });
      });
    });
  });

  let groupTop = await  getGroupTop();
  if(groupTop){
    reorderTabsAndGroups();
  }
}

function ungroupAllTabs() {
  // 获取当前窗口中的所有标签页
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    tabs.forEach((tab) => {
      // 检查标签页是否在分组中
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        // 如果在分组中，则将其移出分组
        chrome.tabs.ungroup(tab.id, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `Error ungrouping tab ${tab.id}:`,
              chrome.runtime.lastError
            );
          } else {
            // console.log(`Tab ${tab.id} has been ungrouped.`);
          }
        });
      }
    });
  });
}

function reorderTabsAndGroups() {
  chrome.windows.getCurrent({ populate: true }, function (currentWindow) {
    chrome.tabGroups.query(
      { windowId: currentWindow.id },
      function (allGroups) {
        let groupPromises = [];
        let ungroupedTabs = [];
        let currentIndex = 0;

        // 首先移动所有的标签组
        allGroups.sort((a, b) => a.id - b.id);
        allGroups.forEach((group) => {
          groupPromises.push(
            new Promise((resolve) => {
              chrome.tabGroups.move(
                group.id,
                { index: currentIndex },
                function () {
                  if (chrome.runtime.lastError) {
                    console.error(
                      "Error moving group:",
                      chrome.runtime.lastError
                    );
                  }
                  chrome.tabs.query(
                    { groupId: group.id },
                    function (groupTabs) {
                      currentIndex += groupTabs.length;
                      resolve();
                    }
                  );
                }
              );
            })
          );
        });

        // 等待所有组移动完成
        Promise.all(groupPromises).then(() => {
          // 找出所有未分组的标签
          chrome.tabs.query(
            {
              windowId: currentWindow.id,
              groupId: chrome.tabGroups.TAB_GROUP_ID_NONE,
            },
            function (tabs) {
              ungroupedTabs = tabs;

              // 移动未分组的标签到末尾
              let movePromises = ungroupedTabs.map(
                (tab) =>
                  new Promise((resolve) => {
                    chrome.tabs.move(tab.id, { index: -1 }, function () {
                      if (chrome.runtime.lastError) {
                        console.error(
                          "Error moving ungrouped tab:",
                          chrome.runtime.lastError
                        );
                      }
                      resolve();
                    });
                  })
              );

              Promise.all(movePromises).then(() => {
                console.log("Tabs and groups reordered successfully");
              });
            }
          );
        });
      }
    );
  });
}
