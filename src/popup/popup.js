document.getElementById("quickGroupButton").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "quickGroup" });
});

// 折叠/展开功能
function setupCollapsible(toggleId, contentId, storageKey, defaultExpanded = false) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  const arrow = toggle.querySelector('.section-arrow');

  // 从 storage 读取折叠状态
  chrome.storage.local.get([storageKey], (result) => {
    // 如果没有存储值，使用默认状态
    const isCollapsed = result[storageKey] !== undefined ? result[storageKey] : !defaultExpanded;
    if (!isCollapsed) {
      content.classList.remove('collapsed');
      arrow.classList.remove('collapsed');
    } else {
      content.classList.add('collapsed');
      arrow.classList.add('collapsed');
    }
  });

  // 点击切换折叠状态
  toggle.addEventListener('click', () => {
    const isCollapsed = content.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');

    // 保存状态
    chrome.storage.local.set({ [storageKey]: isCollapsed });
  });
}

// 初始化折叠功能
document.addEventListener("DOMContentLoaded", () => {
  setupCollapsible('manageToggle', 'manageContent', 'manageCollapsed', false); // 默认折叠
  setupCollapsible('settingsToggle', 'settingsContent', 'settingsCollapsed', false); // 默认折叠
  setupCollapsible('dataToggle', 'dataContent', 'dataCollapsed', false); // 默认折叠
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

document.addEventListener("DOMContentLoaded", function () {
  const toggle = document.getElementById("enableTabSearch");
  const input = document.getElementById("tabSearchKey");
  const keyRow = document.getElementById("tabSearchKeyRow");

  // 初始化显示状态
  function updateVisibility(enabled) {
      if (enabled) {
          keyRow.style.display = 'flex';
      } else {
          keyRow.style.display = 'none';
      }
  }

  // 读取配置
  chrome.storage.local.get(["enableTabSearch", "tabSearchKey"], function (result) {
    // 默认为开启
    const enabled = result.enableTabSearch !== undefined ? result.enableTabSearch : true;
    toggle.checked = enabled;

    // 默认键位 Shift
    if (result.tabSearchKey) {
        input.value = result.tabSearchKey;
    } else {
        input.value = "Shift";
    }

    updateVisibility(enabled);
  });

  // 监听开关
  toggle.addEventListener("change", function () {
    const enabled = toggle.checked;
    updateVisibility(enabled);
    chrome.storage.local.set({ enableTabSearch: enabled });
  });

  // 监听按键录制
  input.addEventListener("keydown", function(e) {
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;

    // 处理单个修饰键 (用于双击触发)
    if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
        input.value = key;
        chrome.storage.local.set({ tabSearchKey: key });
        return;
    }

    // 处理组合键
    const modifiers = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.metaKey) modifiers.push("Meta");

    let keyName = key.length === 1 ? key.toUpperCase() : key;
    if (key === " ") keyName = "Space";

    // 如果是 Escape，可以清除设置? 或者不处理?
    // 这里暂时不做清除逻辑，Escape 用于关闭 UI

    let shortcut = keyName;
    if (modifiers.length > 0) {
        shortcut = modifiers.join("+") + "+" + keyName;
    }

    input.value = shortcut;
    chrome.storage.local.set({ tabSearchKey: shortcut });
  });

  // 聚焦样式
  input.addEventListener("focus", function() {
      input.classList.add("ring-2", "ring-blue-500");
      input.placeholder = "按下快捷键...";
  });

  input.addEventListener("blur", function() {
      input.classList.remove("ring-2", "ring-blue-500");
      if (!input.value) input.placeholder = "点击设置快捷键";
  });
});

