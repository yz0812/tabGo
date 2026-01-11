chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "promptForGroupName") {
        const groupName = prompt("请输入分组名称:");
        // 传回当前的域名与分组名称
        sendResponse({ domain: window.location.hostname, groupName: groupName });
    }
});
