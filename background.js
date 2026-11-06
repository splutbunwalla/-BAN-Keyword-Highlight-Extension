chrome.runtime.onInstalled.addListener(() => {
    // Safely check if the browser supports setAccessLevel before calling it
    if (chrome.storage?.session?.setAccessLevel) {
        chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'});
    }
});
let raceMode = false;
let queueMode = false;
let tabStates = {};
let queue = [];
let isProcessingQueue = false;

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
            isProcessingQueue: currentState.queueMode,
            autoSubmit: request.autoSubmit
        });
    }

    if (request.action === "OPEN_TAB") {
        chrome.tabs.create({url: request.url});
    }

	// --- GLOBAL BAN QUEUE LISTENERS ---
    if (request.action === "GLOBAL_COMMAND") {
        
        chrome.storage.sync.get(['globalServerIds'], (result) => {
            const servers = result.globalServerIds || [];
            
            if (servers.length === 0) {
                console.error("[Global Ban Queue] No Service IDs configured in extension popup.");
                return;
            }

            // Exclude the tab we initiated the command from by strictly comparing strings
            const filteredServers = servers.filter(id => String(id) !== String(request.excludeId));
            
            // Create the new tasks and APPEND them to the existing queue
            const newTasks = filteredServers.map(id => ({ serviceId: id, cmd: request.cmd }));
            queue = queue.concat(newTasks);
            
            if (!isProcessingQueue) {
                processNextInQueue();
            }
        });
    }
    
    if (request.action === "WORKER_COMMAND_DONE") {
        if (tabId) {
            chrome.tabs.remove(tabId); // Close the temporary tab
        }
        setTimeout(processNextInQueue, 800); // Small buffer before the next server
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStates[tabId];
});

async function processNextInQueue() {
    if (queue.length === 0) {
        isProcessingQueue = false;
        console.log("[Global Ban Queue] All servers updated.");
        return;
    }

    isProcessingQueue = true;
    const item = queue.shift();
    
    // Updated Domain to match manifest (gamepanel.hosthavoc.com)
    const url = `https://gamepanel.hosthavoc.com/Aspx/Interface/GameHosting/ServiceWebConsole.aspx?serviceid=${item.serviceId}&auto_cmd=${encodeURIComponent(item.cmd)}`;

    chrome.tabs.create({ url: url, active: false });
}