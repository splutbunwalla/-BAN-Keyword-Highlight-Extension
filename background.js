chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PROXY_COMMAND") {
    // Shouts the command to every frame in the tab; the one with the input box will catch it
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: "EXECUTE_COMMAND", 
      cmd: request.cmd 
    });
  }
});