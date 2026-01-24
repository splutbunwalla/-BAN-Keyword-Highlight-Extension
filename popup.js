const primaryColorInput = document.getElementById("primaryColor");
const primaryAlphaInput = document.getElementById('primaryAlpha');
const secondaryColorInput = document.getElementById("secondaryColor");
const secondaryAlphaInput = document.getElementById('secondaryAlpha');
const steamidColorInput = document.getElementById("steamidColor");
const steamidAlphaInput = document.getElementById('steamidAlpha');
const toggleBtn = document.getElementById("toggle");

let enabled = true;

function updateContentScript() {
  const settings = {
    primaryColor: primaryColorInput.value,
    primaryAlpha: parseFloat(primaryAlphaInput.value),
    secondaryColor: secondaryColorInput.value,
    secondaryAlpha: parseFloat(secondaryAlphaInput.value),
    steamidColor: steamidColorInput.value,
    steamidAlpha: parseFloat(steamidAlphaInput.value)
  };

  // 1. Send message for instant visual feedback (this hits applyStyles)
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateColors",
        ...settings
      });
    }
  });

  // 2. Debounce the storage save to avoid hitting Chrome's sync limits
  clearTimeout(window.saveTimeout);
  window.saveTimeout = setTimeout(() => {
    chrome.storage.sync.set(settings);
  }, 100); 
}


function saveSettingsSilently() {
  const pList = Array.from(document.querySelectorAll("#primary-list .keyword-item")).map(item => ({
    text: item.querySelector("span").textContent,
    enabled: item.querySelector("input[type='checkbox']").checked
  }));

  const sList = Array.from(document.querySelectorAll("#secondary-list .keyword-item")).map(item => ({
    text: item.querySelector("span").textContent,
    enabled: item.querySelector("input[type='checkbox']").checked
  }));

  chrome.storage.sync.set({
    keywords: pList,
    secondarykeywords: sList
  }, () => {
    // Tell the content script to update its keyword lists immediately
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateKeywords", // You may need to add this listener to content.js
          keywords: pList,
          secondarykeywords: sList
        });
      }
    });
  });
}

function renderKeywords(containerId, words, storageKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  words.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "keyword-item";
    
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = item.enabled;
    cb.onchange = () => {
      words[index].enabled = cb.checked;
      saveSettingsSilently();
    };

    const span = document.createElement("span");
    span.textContent = item.text;

    const del = document.createElement("button");
    del.innerHTML = "&times;";
    del.className = "delete-btn"; // Use a class for CSS sizing
    del.onclick = () => {
      words.splice(index, 1);
      renderKeywords(containerId, words, storageKey);
      saveSettingsSilently();
    };

    div.append(cb, span, del);
    container.appendChild(div);
  });
}

function addKeyword(inputId, storageKey, containerId) {
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  
  if (text) {
    chrome.storage.sync.get([storageKey], data => {
      let words = data[storageKey] || [];
      words = words.map(k => typeof k === 'string' ? {text: k, enabled: true} : k);
      words.push({ text: text, enabled: true });
      
      chrome.storage.sync.set({ [storageKey]: words }, () => {
        renderKeywords(containerId, words, storageKey);
        input.value = "";
		saveSettingsSilently();
      });
    });
  }
}

function loadSettings() {
  chrome.storage.sync.get([
    "keywords", "secondarykeywords", 
    "primaryColor", "primaryAlpha", 
    "secondaryColor", "secondaryAlpha", 
    "steamidColor", "steamidAlpha", 
    "enabled"
  ], data => {
    const pWords = (data.keywords || []).map(k => typeof k === 'string' ? {text: k, enabled: true} : k);
    const sWords = (data.secondarykeywords || []).map(k => typeof k === 'string' ? {text: k, enabled: true} : k);
    renderKeywords("primary-list", pWords, "keywords");
    renderKeywords("secondary-list", sWords, "secondarykeywords");

    primaryColorInput.value = data.primaryColor || "#ffff00";
    primaryAlphaInput.value = data.primaryAlpha !== undefined ? data.primaryAlpha : 0.5;
    secondaryColorInput.value = data.secondaryColor || "#00ff00";
    secondaryAlphaInput.value = data.secondaryAlpha !== undefined ? data.secondaryAlpha : 0.5;
    steamidColorInput.value = data.steamidColor || "#ff8c00";
    steamidAlphaInput.value = data.steamidAlpha !== undefined ? data.steamidAlpha : 0.5;

    enabled = data.enabled !== false;
    toggleBtn.textContent = enabled ? "Disable" : "Enable";
  });
}

toggleBtn.addEventListener("click", () => {
  enabled = !enabled;
  chrome.storage.sync.set({ enabled });
  toggleBtn.textContent = enabled ? "Disable" : "Enable";
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "toggle" });
  });
});

document.getElementById("add-primary-btn").addEventListener("click", () => addKeyword("new-primary", "keywords", "primary-list"));
document.getElementById("add-secondary-btn").addEventListener("click", () => addKeyword("new-secondary", "secondarykeywords", "secondary-list"));

// Run on popup open
loadSettings();

// Live Update Listeners
[primaryColorInput, primaryAlphaInput, secondaryColorInput, secondaryAlphaInput, steamidColorInput, steamidAlphaInput].forEach(input => {
  input.addEventListener('input', updateContentScript);
});