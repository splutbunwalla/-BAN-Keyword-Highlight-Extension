const textarea = document.getElementById("keywords");
const secondarytextarea = document.getElementById("secondarykeywords");
const primaryColorInput = document.getElementById("primaryColor");
const secondaryColorInput = document.getElementById("secondaryColor");
const steamidColorInput = document.getElementById("steamidColor");
const saveBtn = document.getElementById("save");
const toggleBtn = document.getElementById("toggle");

let enabled = true;

// Load keywords and colors from storage
function loadSettings() {
  chrome.storage.sync.get(["keywords", "secondarykeywords", "primaryColor", "secondaryColor", "steamidColor", "enabled"], data => {
    textarea.value = (data.keywords || []).join("\n");
    secondarytextarea.value = (data.secondarykeywords || []).join("\n");
    
    // Set colors (with defaults if none saved)
    primaryColorInput.value = data.primaryColor || "#ffff00";
    secondaryColorInput.value = data.secondaryColor || "#00ff00";
    steamidColor.value = data.steamidColor || "#ff8c00";
    enabled = data.enabled ?? true;
    toggleBtn.textContent = enabled ? "Disable" : "Enable";
  });
}

// Save settings to storage and notify content script
saveBtn.addEventListener("click", () => {
  const keywords = textarea.value.split("\n").map(k => k.trim()).filter(Boolean);
  const secondarykeywords = secondarytextarea.value.split("\n").map(k => k.trim()).filter(Boolean);
  const primaryColor = primaryColorInput.value;
  const secondaryColor = secondaryColorInput.value;
  const steamidColor = steamidColorInput.value;

  chrome.storage.sync.set({ 
    keywords, 
    secondarykeywords, 
    primaryColor, 
    secondaryColor,
	steamidColor
  }, () => {
    console.log("Settings saved");
  });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const activeTab = tabs[0];
    if (!activeTab) return;

    chrome.tabs.sendMessage(activeTab.id, {
      action: "setKeywords",
      keywords,
      secondarykeywords,
      primaryColor,
      secondaryColor,
	  steamidColor
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
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "toggle" });
    }
  });
});

loadSettings();