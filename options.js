function refreshWhitelist() {
  chrome.storage.sync.get(["whitelist"], (result) => {
    const whitelist = result.whitelist || [];
    const listElement = document.getElementById("whitelist");
    listElement.innerHTML = "";

    whitelist.forEach((domain, index) => {
      const li = document.createElement("li");
      li.textContent = domain;

      const removeButton = document.createElement("button");
      removeButton.textContent = "删除";
      removeButton.classList.add("remove-button"); // 添加类名以便于样式调整
      removeButton.onclick = () => {
        whitelist.splice(index, 1);
        chrome.storage.sync.set({ whitelist }, refreshWhitelist);
      };

      li.appendChild(removeButton);
      listElement.appendChild(li);
    });
  });
}

document.getElementById("addDomainButton").onclick = () => {
  const domainInput = document.getElementById("domainInput").value.trim();
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
