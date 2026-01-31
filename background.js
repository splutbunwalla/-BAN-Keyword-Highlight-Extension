chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});

// background.js
let raceMode = false;
let queueMode = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Receive State Updates from Content Script
  if (request.action === "SET_RACE_MODE") {
    raceMode = request.value;
    console.log("Race Mode set to:", raceMode);
  }
  
  if (request.action === "SET_QUEUE_MODE") {
    queueMode = request.value;
    console.log("Queue Mode set to:", queueMode);
  }

  // 2. Broadcast Commands to All Frames (with current state)
  if (request.action === "PROXY_COMMAND") {
    if (sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, { 
        action: "EXECUTE_COMMAND", 
        cmd: request.cmd,
        isRacing: raceMode,          // Pass the global truth
        isProcessingQueue: queueMode // Pass the global truth
      });
    }
  }
  
  if (request.action === "OPEN_TAB") {
    chrome.tabs.create({ url: request.url });
  }
});