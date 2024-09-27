// 获取并刷新分组名称列表
function refreshGroupNameList() {
    chrome.storage.sync.get(["groupNames"], (result) => {
        const groupNames = result.groupNames || {};
        const listElement = document.getElementById("groupNameList");
        listElement.innerHTML = "";

        for (const [domain, groupName] of Object.entries(groupNames)) {
            const li = document.createElement("li");
            li.textContent = `${domain} ➡️ ${groupName}`;

            const removeButton = document.createElement("button");
            removeButton.textContent = "删除";
            removeButton.classList.add("remove-button");
            removeButton.onclick = () => {
                removeGroupName(domain);
            };

            li.appendChild(removeButton);
            listElement.appendChild(li);
        }
    });
}

// 添加新的分组名称映射
document.getElementById("addDomainButton").onclick = () => {
    const domainInput = document.getElementById("domainInput").value.trim();
    const groupNameInput = document.getElementById("groupNameInput").value.trim();

    if (domainInput && groupNameInput) {
        chrome.storage.sync.get(["groupNames"], (result) => {
            const groupNames = result.groupNames || {};
            groupNames[domainInput] = groupNameInput;
            chrome.storage.sync.set({ groupNames }, refreshGroupNameList);
        });
    }

    // 清空输入框
    document.getElementById("domainInput").value = "";
    document.getElementById("groupNameInput").value = "";
};

// 删除指定的分组名称映射
function removeGroupName(domain) {
    chrome.storage.sync.get(["groupNames"], (result) => {
        const groupNames = result.groupNames || {};
        if (groupNames.hasOwnProperty(domain)) {
            delete groupNames[domain];
            chrome.storage.sync.set({ groupNames }, refreshGroupNameList);
        }
    });
}

// 初始化时刷新分组名称列表
document.addEventListener("DOMContentLoaded", refreshGroupNameList);
