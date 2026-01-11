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
        const emptyState = document.getElementById("emptyState");
        
        listElement.innerHTML = "";

        // 检查是否为空
        if (Object.keys(groupNames).length === 0) {
            emptyState.style.display = "block";
            return;
        }

        emptyState.style.display = "none";

        for (const [groupName, domains] of Object.entries(groupNames)) {
            const groupLi = document.createElement("li");
            groupLi.className = "group-item";

            const groupHeader = document.createElement("div");
            groupHeader.className = "group-header";
            groupHeader.onclick = () => {
                groupLi.classList.toggle("expanded");
            };

            const expandIcon = document.createElement("div");
            expandIcon.className = "expand-icon";
            groupHeader.appendChild(expandIcon);

            const groupNameSpan = document.createElement("span");
            groupNameSpan.className = "group-name";
            groupNameSpan.textContent = groupName;
            groupHeader.appendChild(groupNameSpan);

            const domainCount = document.createElement("span");
            domainCount.className = "domain-count";
            domainCount.textContent = `(${domains.length})`;
            groupHeader.appendChild(domainCount);

            const groupDeleteButton = document.createElement("button");
            groupDeleteButton.textContent = "×";
            groupDeleteButton.className = "remove-button";
            groupDeleteButton.style.marginLeft = "8px";
            groupDeleteButton.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除分组"${groupName}"吗？`)) {
                    removeGroup(groupName);
                }
            };
            groupHeader.appendChild(groupDeleteButton);

            groupLi.appendChild(groupHeader);

            const domainList = document.createElement("div");
            domainList.className = "domain-list";

            domains.forEach(domain => {
                const domainItem = document.createElement("div");
                domainItem.className = "domain-item";

                const domainText = document.createElement("span");
                domainText.className = "domain-text";
                domainText.textContent = domain;
                domainItem.appendChild(domainText);

                const removeButton = document.createElement("button");
                removeButton.textContent = "×";
                removeButton.className = "remove-button";
                removeButton.onclick = () => {
                    removeDomainFromGroup(groupName, domain);
                };
                domainItem.appendChild(removeButton);
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
