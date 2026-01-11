document.getElementById("quickGroupButton").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "quickGroup" });
});

// 导出配置
document.getElementById("exportButton").addEventListener("click", () => {
  chrome.storage.sync.get(["whitelist", "groupNames"], (result) => {
    const data = {
      whitelist: result.whitelist || [],
      groupNames: result.groupNames || {}
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabgo-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

// 导入配置
document.getElementById("importButton").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      chrome.storage.sync.get(["whitelist", "groupNames"], (result) => {
        const whitelist = result.whitelist || [];
        const groupNames = result.groupNames || {};

        // 合并白名单
        if (imported.whitelist) {
          imported.whitelist.forEach(domain => {
            if (!whitelist.includes(domain)) {
              whitelist.push(domain);
            }
          });
        }

        // 合并分组名称
        if (imported.groupNames) {
          for (const [groupName, domains] of Object.entries(imported.groupNames)) {
            if (!groupNames[groupName]) {
              groupNames[groupName] = [];
            }
            domains.forEach(domain => {
              if (!groupNames[groupName].includes(domain)) {
                groupNames[groupName].push(domain);
              }
            });
          }
        }

        chrome.storage.sync.set({ whitelist, groupNames }, () => {
          alert("导入成功！");
        });
      });
    } catch (error) {
      alert("导入失败：文件格式错误");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});




document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("subdomainToggle");

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(["subdomainEnabled"], function (result) {
    if (result.subdomainEnabled !== undefined) {
      toggle.checked = result.subdomainEnabled; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ subdomainEnabled: isEnabled }, function () {
      //  console.log('Subdomain toggle state saved:', isEnabled);
    });
  });
});



document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("groupTop");

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(["groupTop"], function (result) {
    if (result.groupTop !== undefined) {
      toggle.checked = result.groupTop; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ groupTop: isEnabled }, function () {
      //  console.log('Subdomain toggle state saved:', isEnabled);
    });
  });
});


document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("accordion");

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(["accordion"], function (result) {
    if (result.accordion !== undefined) {
      toggle.checked = result.accordion; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ accordion: isEnabled }, function () {
      //  console.log('Subdomain toggle state saved:', isEnabled);
    });
  });
});


document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("extensionReplace");

  // 从 chrome.storage.local 中读取开关状态·
  chrome.storage.local.get(["extensionReplace"], function (result) {
    if (result.extensionReplace !== undefined) {
      toggle.checked = result.extensionReplace; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ extensionReplace: isEnabled }, function () {
      //  console.log('Subdomain toggle state saved:', isEnabled);
    });
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("enableNewtabGrouping");

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(["enableNewtabGrouping"], function (result) {
    if (result.enableNewtabGrouping !== undefined) {
      toggle.checked = result.enableNewtabGrouping; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ enableNewtabGrouping: isEnabled }, function () {});
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("clearGroupedTabs");

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(["clearGroupedTabs"], function (result) {
    if (result.clearGroupedTabs !== undefined) {
      toggle.checked = result.clearGroupedTabs; // 根据存储的值设置 toggle 的初始状态
    }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener("change", function () {
    const isEnabled = toggle.checked; // 获取当前开关状态
    chrome.storage.local.set({ clearGroupedTabs: isEnabled }, function () {});
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const select = document.getElementById("groupSortMode");

  // 从 chrome.storage.local 中读取排序模式
  chrome.storage.local.get(["groupSortMode"], function (result) {
    if (result.groupSortMode !== undefined) {
      select.value = result.groupSortMode;
    }
  });

  // 当选择改变时，将新状态写入 chrome.storage.local
  select.addEventListener("change", function () {
    const mode = select.value;
    chrome.storage.local.set({ groupSortMode: mode }, function () {});
  });
});

