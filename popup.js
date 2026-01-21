const textarea = document.getElementById("keywords");
const secondarytextarea = document.getElementById("secondarykeywords");
const primaryColorInput = document.getElementById("primaryColor");
const primaryAlphaInput = document.getElementById('primaryAlpha');
const secondaryColorInput = document.getElementById("secondaryColor");
const secondaryAlphaInput = document.getElementById('secondaryAlpha');
const steamidColorInput = document.getElementById("steamidColor");
const steamidAlphaInput = document.getElementById('steamidAlpha');
const saveBtn = document.getElementById("save");
const toggleBtn = document.getElementById("toggle");

let enabled = true;

function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Load keywords and colors from storage
function loadSettings() {
  chrome.storage.sync.get(["keywords", "secondarykeywords", "primaryColor", "secondaryColor", "steamidColor", "primaryAlpha", "secondaryAlpha", "steamidAlpha", "enabled"], data => {
    textarea.value = (data.keywords || []).join("\n");
    secondarytextarea.value = (data.secondarykeywords || []).join("\n");
    
    // Set colors (with defaults if none saved)
    primaryColorInput.value = data.primaryColor || "#ffff00";
	primaryAlphaInput.value = data.primaryAlpha || 1;
    secondaryColorInput.value = data.secondaryColor || "#00ff00";
    secondaryAlphaInput.value = data.secondaryAlpha || 1;
	steamidColorInput.value = data.steamidColor || "#ff8c00";
	steamidAlphaInput.value = data.steamidAlpha || 1;
    enabled = data.enabled ?? true;
    toggleBtn.textContent = enabled ? "Disable" : "Enable";
  });
}

// Save settings to storage and notify content script
saveBtn.addEventListener("click", () => {
  const keywords = textarea.value.split("\n").map(k => k.trim()).filter(Boolean);
  const secondarykeywords = secondarytextarea.value.split("\n").map(k => k.trim()).filter(Boolean);

  const primaryColor = primaryColorInput.value;
  const primaryAlpha = primaryAlphaInput.value;
  const secondaryColor = secondaryColorInput.value;
  const secondaryAlpha = secondaryAlphaInput.value;
  const steamidColor = steamidColorInput.value;
  const steamidAlpha = steamidAlphaInput.value;

  chrome.storage.sync.set({ 
    keywords, 
    secondarykeywords, 
    primaryColor, 
    primaryAlpha,
    secondaryColor,
    secondaryAlpha,
    steamidColor,
    steamidAlpha
  }, () => {
    console.log("Settings saved");
  });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const activeTab = tabs[0];
    if (!activeTab) return;

    chrome.tabs.sendMessage(activeTab.id, {
      action: "updateColors",
      keywords,
      secondarykeywords,
	  primaryColor,
      primaryAlpha,
      secondaryColor,
      secondaryAlpha,
      steamidColor,
      steamidAlpha
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