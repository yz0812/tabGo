document.getElementById("quickGroupButton").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "quickGroup" });
});


document.getElementById('toggleSettings').addEventListener('click', function() {
  var settingsContainer = document.getElementById('settingsContainer');
  if (settingsContainer.style.display === 'none' || settingsContainer.style.display === '') {
    settingsContainer.style.display = 'block';
    this.textContent = '收起';
  } else {
    settingsContainer.style.display = 'none';
    this.textContent = '更多';
  }
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

  // 从 chrome.storage.local 中读取开关状态
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

