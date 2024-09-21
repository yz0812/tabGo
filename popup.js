document.getElementById('quickGroupButton').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'quickGroup' });
});



document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.getElementById('subdomainToggle');

  // 从 chrome.storage.local 中读取开关状态
  chrome.storage.local.get(['subdomainEnabled'], function(result) {
      if (result.subdomainEnabled !== undefined) {
          toggle.checked = result.subdomainEnabled; // 根据存储的值设置 toggle 的初始状态
      }
  });

  // 当 toggle 开关状态改变时，将新状态写入 chrome.storage.local
  toggle.addEventListener('change', function () {
      const isEnabled = toggle.checked; // 获取当前开关状态
      chrome.storage.local.set({ subdomainEnabled: isEnabled }, function() {
        //  console.log('Subdomain toggle state saved:', isEnabled);
      });
  });
});
