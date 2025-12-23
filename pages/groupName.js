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

// 获取并刷新分组名称列表
function refreshGroupNameList() {
    chrome.storage.sync.get(["groupNames"], (result) => {
        const groupNames = result.groupNames || {};
        const listElement = document.getElementById("groupNameList");
        listElement.innerHTML = "";

        for (const [groupName, domains] of Object.entries(groupNames)) {
            const groupLi = document.createElement("li");
            groupLi.className = "bg-white mb-2.5 rounded-lg border border-gray-100 overflow-hidden";

            const groupTitle = document.createElement("strong");
            groupTitle.className = "flex items-center px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-gray-50 before:content-[''] before:w-0 before:h-0 before:border-t-[4px] before:border-t-transparent before:border-b-[4px] before:border-b-transparent before:border-l-[6px] before:border-l-gray-400 before:mr-2.5 before:transition-transform";
            groupTitle.textContent = groupName;
            groupTitle.onclick = () => {
                groupLi.classList.toggle("expanded");
            };

            const groupDeleteIcon = document.createElement("span");
            groupDeleteIcon.textContent = "✕";
            groupDeleteIcon.className = "text-red-500 cursor-pointer text-lg ml-auto hover:text-red-700";
            groupDeleteIcon.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除分组"${groupName}"吗？`)) {
                    removeGroup(groupName);
                }
            };
            groupTitle.appendChild(groupDeleteIcon);

            groupLi.appendChild(groupTitle);

            const domainList = document.createElement("div");
            domainList.className = "domain-list hidden p-2 bg-gray-50 border-t border-gray-100";

            domains.forEach(domain => {
                const domainItem = document.createElement("div");
                domainItem.className = "flex items-center px-2.5 py-1.5 mb-1 rounded bg-white/50 hover:bg-white/80 transition-colors";

                const domainText = document.createElement("span");
                domainText.className = "flex-1 text-sm text-gray-700 break-all";
                domainText.textContent = domain;
                domainItem.appendChild(domainText);

                const removeIcon = document.createElement("span");
                removeIcon.textContent = "✕";
                removeIcon.className = "text-gray-300 cursor-pointer text-base ml-2 hover:text-red-500";
                removeIcon.onclick = () => {
                    removeDomainFromGroup(groupName, domain);
                };
                domainItem.appendChild(removeIcon);
                domainList.appendChild(domainItem);
            });

            groupLi.appendChild(domainList);
            listElement.appendChild(groupLi);
        }
    });
}

// 添加新的域名到分组
document.getElementById("addDomainButton").onclick = () => {
    const groupNameInput = document.getElementById("groupNameInput").value.trim();
    const domainInput = extractHostname(document.getElementById("domainInput").value.trim());

    if (groupNameInput && domainInput) {
        chrome.storage.sync.get(["groupNames"], (result) => {
            const groupNames = result.groupNames || {};
            if (!groupNames[groupNameInput]) {
                groupNames[groupNameInput] = [];
            }
            if (!groupNames[groupNameInput].includes(domainInput)) {
                groupNames[groupNameInput].push(domainInput);
            }
            chrome.storage.sync.set({ groupNames }, refreshGroupNameList);
        });
    }

    // 清空输入框
    document.getElementById("groupNameInput").value = "";
    document.getElementById("domainInput").value = "";
};

// 从分组中删除指定的域名
function removeDomainFromGroup(groupName, domain) {
    chrome.storage.sync.get(["groupNames"], (result) => {
        const groupNames = result.groupNames || {};
        if (groupNames[groupName]) {
            groupNames[groupName] = groupNames[groupName].filter(d => d !== domain);
            if (groupNames[groupName].length === 0) {
                delete groupNames[groupName];
            }
            chrome.storage.sync.set({ groupNames }, refreshGroupNameList);
        }
    });
}

// 删除整个分组
function removeGroup(groupName) {
    chrome.storage.sync.get(["groupNames"], (result) => {
        const groupNames = result.groupNames || {};
        if (groupNames[groupName]) {
            delete groupNames[groupName];
            chrome.storage.sync.set({ groupNames }, refreshGroupNameList);
        }
    });
}

// 初始化时刷新分组名称列表
document.addEventListener("DOMContentLoaded", refreshGroupNameList);
