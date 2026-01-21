const textarea = document.getElementById("keywords");
const secondarytextarea = document.getElementById("secondarykeywords");
const saveBtn = document.getElementById("save");
const toggleBtn = document.getElementById("toggle");

let enabled = true;

// Load keywords directly from storage on popup open
function loadKeywords() {
  chrome.storage.sync.get(["keywords", "enabled", "secondarykeywords"], data => {
    textarea.value = (data.keywords || []).join("\n");
    enabled = data.enabled ?? true;
	secondarytextarea.value = (data.secondarykeywords || []).join("\n");
    toggleBtn.textContent = enabled ? "Disable" : "Enable";
  });
}

// Save keywords to storage and send to content script
saveBtn.addEventListener("click", () => {
  const keywords = textarea.value
    .split("\n")
    .map(k => k.trim())
    .filter(Boolean);

  const secondarykeywords = secondarytextarea.value
    .split("\n")
    .map(k => k.trim())
    .filter(Boolean);

  chrome.storage.sync.set({ keywords, secondarykeywords }, () => {
	console.log("Settings saved");
  });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const activeTab = tabs[0];
    if (!activeTab) return;

    chrome.tabs.sendMessage(activeTab.id, {
      action: "setKeywords",
      keywords: keywords, 
      secondarykeywords: secondarykeywords
    });
  
  chrome.tabs.reload(activeTab.id, { bypassCache: true });
  
  });
});

// Toggle detector
toggleBtn.addEventListener("click", () => {
  enabled = !enabled;
  chrome.storage.sync.set({ enabled });

  toggleBtn.textContent = enabled ? "Disable" : "Enable";

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "toggle" });
  });
});

// Initial load
loadKeywords();
