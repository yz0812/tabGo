// 验证是否为有效的IP地址
function isValidIP(str) {
    const parts = str.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255 && part === num.toString();
    });
}

// 验证是否为有效的域名
function isValidDomain(str) {
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(str);
}

// 从URL中提取域名或IP
function extractHostname(input) {
    if (!input) return '';
    try {
        const url = new URL(input.includes('://') ? input : 'http://' + input);
        const hostname = url.hostname;
        return (isValidIP(hostname) || isValidDomain(hostname)) ? hostname : '';
    } catch (e) {
        return (isValidIP(input) || isValidDomain(input)) ? input : '';
    }
}

function refreshWhitelist() {
  chrome.storage.sync.get(["whitelist"], (result) => {
    const whitelist = result.whitelist || [];
    const listElement = document.getElementById("whitelist");
    listElement.innerHTML = "";

    whitelist.forEach((domain, index) => {
      const li = document.createElement("li");
      li.textContent = domain;

      const removeIcon = document.createElement("span");
      removeIcon.textContent = "×";
      removeIcon.className = "remove-icon";
      removeIcon.onclick = () => {
        whitelist.splice(index, 1);
        chrome.storage.sync.set({ whitelist }, refreshWhitelist);
      };

      li.appendChild(removeIcon);
      listElement.appendChild(li);
    });
  });
}

document.getElementById("addDomainButton").onclick = () => {
  const domainInput = extractHostname(document.getElementById("domainInput").value.trim());
  if (domainInput) {
    chrome.storage.sync.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      if (!whitelist.includes(domainInput)) {
        whitelist.push(domainInput);
        chrome.storage.sync.set({ whitelist }, refreshWhitelist);
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", refreshWhitelist);
