chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "addWhitelist",
    title: "添加到白名单",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "manageGroupName",
    title: "设置分组名称",
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
// 监听标签页激活事件
chrome.tabs.onActivated.addListener((activeInfo) => {
  // 获取更多关于新激活标签页的信息
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // 这里可以添加您想在标签页切换时执行的任何操作
    collapseOtherTabGroups(tab).then(console.log).catch(console.error);
  });
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

  if (changes.groupNames) {
    groupTabs();
  }
  
  if (changes.accordion) {
    const newValue = changes.accordion.newValue;
    if(newValue){
      getActiveTab(function(activeTab) {
        if (activeTab) {
          collapseOtherTabGroups(activeTab)
        }
      });
      
    }else{
    expandAllTabGroups();
    }
  }



  if (changes.extensionReplace) {
    extensionReplace(changes.extensionReplace.newValue);
  }
});




// 扩展名称
function extensionReplace(newValue){
  if(newValue){
    chrome.management.getAll(extensions => {
      const extensionMap = {};
      
      // 生成映射
      extensions.forEach(ext => {
        extensionMap[ext.id] = ext.name;
      });
      // 存储到本地
      chrome.storage.local.set({ extensionReplaceMap: extensionMap });
    });
  }else{
    chrome.storage.local.remove('extensionReplaceMap');
  }
}


// 在background script中监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "quickGroup") {
    groupTabs(); // 调用你的快速分组逻辑
    sendResponse({ status: "Tabs grouped successfully" });
  }
});

// 白名单存储和读取
function whitelist(callback) {
  chrome.storage.sync.get(["whitelist"], function (result) {
    callback(result.whitelist || []);
  });
}

// 获取别名
function getGroupNames() {

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["groupNames"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Error getting groupNames: ${chrome.runtime.lastError}`
          )
        );
      } else {
        const groupNames =
          result.groupNames !== undefined
            ? result.groupNames
            : {};
        resolve(groupNames);
      }
    });
  });
}



//获取白名单
function getWhitelist() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["whitelist"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Error getting whitelist: ${chrome.runtime.lastError}`
          )
        );
      } else {
        const whitelist =
          result.whitelist !== undefined
            ? result.whitelist
            : [];
        resolve(whitelist);
      }
    });
  });
}

// 子域名分组
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




// 分组靠前
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

// 扩展名称开启状态
function getExtensionReplace() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["extensionReplace"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`Error getting extensionReplace: ${chrome.runtime.lastError}`)
        );
      } else {
        const extensionReplace =
          result.extensionReplace !== undefined ? result.extensionReplace : false;
        resolve(extensionReplace);
      }
    });
  });
}

// 扩展名称替换
function getExtensionReplaceMap() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["extensionReplaceMap"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`Error getting extensionReplaceMap: ${chrome.runtime.lastError}`)
        );
      } else {
        const extensionReplaceMap =
          result.extensionReplaceMap !== undefined ? result.extensionReplaceMap : {};
        resolve(extensionReplaceMap);
      }
    });
  });
}


// 别名
function getAccordionEnabled() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["accordion"], function (result) {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`Error getting accordion: ${chrome.runtime.lastError}`)
        );
      } else {
        const isEnabled =
          result.accordion !== undefined ? result.accordion : false;
        resolve(isEnabled);
      }
    });
  });
}


//白名单
function addToWhitelist(domain) {
  whitelist(function (whitelist) {
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
  } else if (info.menuItemId === "manageGroupName") {
    // 向当前选项卡发送消息，弹出设置分组名称的 prompt
    chrome.tabs.sendMessage(
      tab.id,
      { action: "promptForGroupName" },
      (response) => {
        if (response && response.groupName && response.domain) {
          setGroupName(response.domain, response.groupName); // 设置分组名称
        }
      }
    );
    groupTabs();
  }
});

async function groupTabs() {
  // 子域名分组
  const localIsEnabled = await getSubdomainEnabled();
  // 获取白名单
  const whitelist = await getWhitelist();
  // 获取分组别名
  const groupNames = await getGroupNames();
  // 获取扩展名称分组
  const extensionReplaceMap = await getExtensionReplaceMap();

  // 扩展名称开启状态
  const extensionReplace = await getExtensionReplace();

      chrome.tabs.query({}, function (tabs) {
        let groups = {}; // 用于存储每个分组名称的标签
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

              // 模糊匹配白名单
              if (whitelist.some((domain) => domain.includes(topLevelDomain))) {
                return;
              }


              
              let groupName =topLevelDomain;
             
              if(extensionReplace){
                if(tab.url.startsWith('extension://')|| tab.url.startsWith('chrome-extension://')){
                  // 获取扩展名称分组
                  groupName = extensionReplaceMap[topLevelDomain] || topLevelDomain;
                }
              }else{
                   // 获取自定义分组名称
                   groupName = groupNames[topLevelDomain] || topLevelDomain;
              }
            


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
                  const finalGroupName = groupName || "新分组";

                  // 更新分组的标题，只在新建时设置
                  if (groupId) {
                    chrome.tabGroups.update(
                      groupId,
                      { title: finalGroupName },
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
                    // 已移出分组
                  });
                }
              });
            });
          });
        });

        // 如果启用了分组在前的功能，重新排序标签和分组
        chrome.storage.local.get(["groupTop"], async function (result) {
          const groupTop = result.groupTop || false;
          if (groupTop) {
            reorderTabsAndGroups();
          }
        });
      });
}


// 获取当前激活的tab
function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length > 0) {
      let activeTab = tabs[0];
      callback(activeTab);
    } else {
      callback(null);
    }
  });
}

//取消所有标签页的分组
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
// 重新排序
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

async function setGroupName(domain, newGroupName) {
  // 与chrome storage同步
  chrome.storage.sync.get(["groupNames"], async function (result) {
    const subdomainEnabled = await getSubdomainEnabled();
    const groupNames = result.groupNames || {};
    const domainParts = domain.split(".");

    // 如果未启用子域名，则提取一级域名
    let topLevelDomain = domainParts;
    if (!subdomainEnabled) {
      topLevelDomain = domainParts.slice(-2).join("."); // 提取一级域名
    }

    groupNames[topLevelDomain] = newGroupName;
    chrome.storage.sync.set({ groupNames });
  });
}

// 手风琴模式
function collapseTabGroup(groupId, retryCount = 0) {
  return new Promise((resolve, reject) => {
    chrome.tabGroups.update(groupId, { collapsed: true }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          // `尝试折叠标签组 ${groupId} 时出错:`,
          chrome.runtime.lastError.message
        );
        if (
          retryCount < 5 &&
          chrome.runtime.lastError.message.includes(
            "Tabs cannot be edited right now"
          )
        ) {
          // 增加等待时间和重试次数
          setTimeout(() => {
            resolve(collapseTabGroup(groupId, retryCount + 1));
          }, 100 * (retryCount + 1)); // 逐渐增加等待时间
        } else {
          reject(chrome.runtime.lastError);
        }
      } else {
        resolve();
      }
    });
  });
}

async function collapseOtherTabGroups(currentTab) {
  // 是否开启手风琴模式
  let accordionEnabled = await getAccordionEnabled();
  if (!accordionEnabled) {
    return;
  }
  return new Promise((resolve, reject) => {
    const currentWindowId = currentTab.windowId;
    const currentTabGroupId = currentTab.groupId;

    chrome.tabGroups.query({ windowId: currentWindowId }, (groups) => {
      const collapsePromises = groups.map((group) => {
        if (group.id !== currentTabGroupId && !group.collapsed) {
          return collapseTabGroup(group.id);
        }
        return Promise.resolve();
      });

      Promise.all(collapsePromises)
        .then(() => {
          //   resolve("所有其他未折叠的标签组已尝试收起")
        })
        .catch((error) => {
          //  console.error("折叠标签组时遇到错误:", error);
          ///  resolve("部分标签组可能未能成功折叠");
        });
    });
  });
}
//展开全部分组
function expandAllTabGroups() {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent({ populate: true }, (window) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(`获取当前窗口时出错: ${chrome.runtime.lastError.message}`)
        );
        return;
      }

      chrome.tabGroups.query({ windowId: window.id }, (groups) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(`查询标签组时出错: ${chrome.runtime.lastError.message}`)
          );
          return;
        }

        const expandPromises = groups.map(
          (group) =>
            new Promise((resolveGroup) => {
              chrome.tabGroups.update(group.id, { collapsed: false }, () => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    `展开标签组 ${group.id} 时出错: ${chrome.runtime.lastError.message}`
                  );
                }
                resolveGroup();
              });
            })
        );

        Promise.all(expandPromises)
          .then(() => {
            resolve(`已尝试展开 ${groups.length} 个标签组`);
          })
          .catch((error) => {
            reject(new Error(`展开标签组时发生错误: ${error.message}`));
          });
      });
    });
  });
}