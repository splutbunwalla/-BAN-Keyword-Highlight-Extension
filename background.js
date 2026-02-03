chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'});
});

// background.js
let raceMode = false;
let queueMode = false;
let tabStates = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab ? sender.tab.id : null;
    if (request.action === "SET_RACE_MODE" && tabId) {
        if (!tabStates[tabId]) tabStates[tabId] = {};
        tabStates[tabId].raceMode = request.value;
        console.log(`Tab ${tabId} Race Mode:`, request.value);
    }

    if (request.action === "SET_QUEUE_MODE" && tabId) {
        if (!tabStates[tabId]) tabStates[tabId] = {};
        tabStates[tabId].queueMode = request.value;
    }

    if (request.action === "PROXY_COMMAND" && tabId) {
        const currentState = tabStates[tabId] || {raceMode: false, queueMode: false};

        chrome.tabs.sendMessage(tabId, {
            action: "EXECUTE_COMMAND",
            cmd: request.cmd,
            isRacing: currentState.raceMode,
            isProcessingQueue: currentState.queueMode
        });
    }

    if (request.action === "OPEN_TAB") {
        chrome.tabs.create({url: request.url});
    }
});


chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStates[tabId];
});