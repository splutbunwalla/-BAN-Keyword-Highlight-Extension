const toggleCheckbox = document.getElementById("toggleCheckbox");
const container = document.querySelector('.main-container');
const toggle = document.getElementById('toggleCheckbox');
const muteAllToggle = document.getElementById("muteAllToggle");
const speakerIconSVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:block;">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
</svg>`;
let enabled = true;
let isClosing = false;
let debounceTimer;
let KEYWORDS = [];
let SECONDARYWORDS = [];

function closePopup() {
  if (isClosing) return;
  isClosing = true;

  container.classList.add('closing');

  setTimeout(() => {
    window.close();
  }, 140);
}

document.addEventListener('click', (e) => {
  if (!container.contains(e.target)) {
    closePopup();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePopup();
  }
});

function updateContentScript() {
  const settings = {
    primaryColor: document.getElementById("primaryColor").value,
    primaryColorMid: document.getElementById("primaryColorMid").value,
    primaryColorEnd: document.getElementById("primaryColorEnd").value,
    primaryTextColor: document.getElementById("primaryTextColor").value,
    primaryBorderColor: document.getElementById("primaryBorderColor").value,
    primaryAlpha: parseFloat(document.getElementById("primaryAlpha").value),
    
    secondaryColor: document.getElementById("secondaryColor").value,
    secondaryColorMid: document.getElementById("secondaryColorMid").value,
    secondaryColorEnd: document.getElementById("secondaryColorEnd").value,
    secondaryTextColor: document.getElementById("secondaryTextColor").value,
    secondaryBorderColor: document.getElementById("secondaryBorderColor").value,
    secondaryAlpha: parseFloat(document.getElementById("secondaryAlpha").value),
    
	steamidColor: document.getElementById("steamidColor").value,
    steamidColorMid: document.getElementById("steamidColorMid").value,
    steamidColorEnd: document.getElementById("steamidColorEnd").value,
    steamidTextColor: document.getElementById("steamidTextColor").value,
    steamidBorderColor: `#FFFFFF`,
	// document.getElementById("steamidBorderColor").value,
    steamidAlpha: parseFloat(document.getElementById("steamidAlpha").value),
  };

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "update", settings: settings });
    }
  });

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    chrome.storage.sync.set(settings);
  }, 250);
}

function saveSettingsSilently() {
  chrome.storage.sync.get(["keywords", "secondarykeywords", "messages"], (data) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateKeywords",
          keywords: data.keywords || [],
          secondarykeywords: data.secondarykeywords || [],
          messages: data.messages || []
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
    
	const dingBtn = document.createElement('button');
	dingBtn.className = 'icon-btn ding-btn' + (item.ding ? ' active' : '');
	dingBtn.innerHTML = speakerIconSVG;
	dingBtn.title = item.ding ? "Sound On" : "Sound Off";

	dingBtn.onclick = () => {
		item.ding = !item.ding;
		
		dingBtn.classList.toggle('active', item.ding);
		dingBtn.title = item.ding ? "Sound On" : "Sound Off";
		
		chrome.storage.sync.set({ [storageKey]: words }, () => {
			chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
				if (tabs[0]?.id) {
					chrome.tabs.sendMessage(tabs[0].id, {
						action: "updateKeywordsOnly", // New action to avoid re-scan
						keywords: storageKey === "keywords" ? words : KEYWORDS,
						secondarykeywords: storageKey === "secondarykeywords" ? words : SECONDARYWORDS
					});
				}
			});
		});
	};
  
	const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = item.enabled !== false; // Default to true
    cb.onchange = () => {
      words[index].enabled = cb.checked;
      chrome.storage.sync.set({ [storageKey]: words }, () => {
        saveSettingsSilently();
      });
    };

    const span = document.createElement("span");
    span.textContent = item.text;

	const del = document.createElement("button");
    del.innerHTML = "&times;";
    del.className = "delete-btn";
    del.onclick = () => {
      words.splice(index, 1);
      chrome.storage.sync.set({ [storageKey]: words }, () => {
        renderKeywords(containerId, words, storageKey);
        saveSettingsSilently();
      });
    };

	div.append(cb, dingBtn, span, del);
    container.appendChild(div);
  });
}

function renderMessages(messages) {
  const container = document.getElementById("message-list");
  container.innerHTML = "";
  
  messages.forEach((m, index) => {
    const div = document.createElement("div");
    div.className = "keyword-item";

    const info = document.createElement("div");
    info.className = "item-info";
    // Tooltip: shows the full message when hovering
    info.setAttribute('title', m.text); 
    
    info.innerHTML = `
      <span class="item-label-text">${m.label}</span>
      <span class="item-text-val">${m.text}</span>
    `;

    const del = document.createElement("button");
    del.innerHTML = "&times;";
    del.className = "delete-btn";
    
    del.onclick = () => {
      messages.splice(index, 1);
      chrome.storage.sync.set({ messages: messages }, () => {
        renderMessages(messages);
        saveSettingsSilently(); // Update the broadcast to content script
      });
    };

    div.append(info, del);
    container.appendChild(div);
  });
}

function addKeyword(inputId, storageKey, listId) {
  const input = document.getElementById(inputId);
  const rawValue = input.value.trim();
  if (!rawValue) return;

  // Split by newlines, trim each line, and remove empty results
  const newEntries = rawValue.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  chrome.storage.sync.get([storageKey], (data) => {
    let currentKeywords = data[storageKey] || [];
    
    // Add all new lines to the list
    newEntries.forEach(word => {
      // Avoid exact duplicates
      if (!currentKeywords.some(k => (typeof k === 'string' ? k : k.text) === word)) {
        currentKeywords.push({ text: word, enabled: true, ding: true });
      }
    });

    chrome.storage.sync.set({ [storageKey]: currentKeywords }, () => {
      input.value = ""; // Clear the textarea
      renderKeywords(listId, currentKeywords, listId);
      updateContentScript();
    });
  });
}

function addMessage() {
  const labelInput = document.getElementById("new-msg-label");
  const textInput = document.getElementById("new-msg-text");
  const label = labelInput.value.trim();
  const text = textInput.value.trim();

  if (text) {
    chrome.storage.sync.get(["messages"], data => {
      const msgs = data.messages || [];
      msgs.push({ label: label || "Msg", text: text });
      chrome.storage.sync.set({ messages: msgs }, () => {
        renderMessages(msgs);
        labelInput.value = "";
        textInput.value = "";
        saveSettingsSilently();
      });
    });
  }
}

function loadSettings() {
  chrome.storage.sync.get([
    "keywords", "secondarykeywords", "messages", "enabled", "muteAll",
    "primaryColor", "primaryColorMid", "primaryColorEnd", "primaryTextColor", "primaryBorderColor", "primaryAlpha",
    "secondaryColor", "secondaryColorMid", "secondaryColorEnd", "secondaryTextColor", "secondaryBorderColor", "secondaryAlpha",
    "steamidColor", "steamidColorMid", "steamidColorEnd", "steamidTextColor", "steamidBorderColor", "steamidAlpha"
  ], (data) => {
    // Load Lists
    KEYWORDS = data.keywords || [];
    SECONDARYWORDS = data.secondarykeywords || [];

    // Use the variables to render
    renderKeywords("primary-list", KEYWORDS, "keywords");
    renderKeywords("secondary-list", SECONDARYWORDS, "secondarykeywords");

    renderMessages(data.messages || []);

    // Load Primary Styles (with defaults to match your specific CSS request)
    document.getElementById("primaryColor").value = data.primaryColor || "#a70000";
    document.getElementById("primaryColorMid").value = data.primaryColorMid || "#000000";
    document.getElementById("primaryColorEnd").value = data.primaryColorEnd || "#ff0000";
    document.getElementById("primaryTextColor").value = data.primaryTextColor || "#ffffff";
    document.getElementById("primaryBorderColor").value = data.primaryBorderColor || "#f13333";
    document.getElementById("primaryAlpha").value = data.primaryAlpha !== undefined ? data.primaryAlpha : 1;

    // Load Secondary Styles
    document.getElementById("secondaryColor").value = data.secondaryColor || "#ffff33";
    document.getElementById("secondaryColorMid").value = data.secondaryColorMid || "#ffff33";
    document.getElementById("secondaryColorEnd").value = data.secondaryColorEnd || "#ffff33";
    document.getElementById("secondaryTextColor").value = data.secondaryTextColor || "#000000";
    document.getElementById("secondaryBorderColor").value = data.secondaryBorderColor || "transparent";
    document.getElementById("secondaryAlpha").value = data.secondaryAlpha !== undefined ? data.secondaryAlpha : 0.5;

    // Load SteamID Styles
	document.getElementById("steamidColor").value = data.steamidColor || "#ff8c00";
    document.getElementById("steamidColorMid").value = data.steamidColorMid || "#ff8c00";
    document.getElementById("steamidColorEnd").value = data.steamidColorEnd || "#ff8c00";
    document.getElementById("steamidTextColor").value = data.steamidTextColor || "#000000";
    // document.getElementById("steamidBorderColor").value = data.steamidBorderColor || "transparent";
    document.getElementById("steamidAlpha").value = data.steamidAlpha !== undefined ? data.steamidAlpha : 0.5;

    // Extension Toggle State
    enabled = data.enabled !== false;
    if (muteAllToggle) {
      muteAllToggle.checked = !!data.muteAll;
    }
    toggleCheckbox.checked = enabled;
    container.classList.toggle('disabled', !enabled);
  });
}

muteAllToggle.addEventListener("change", () => {
  const isCurrentlyMuted = muteAllToggle.checked;
  
  // Save to storage (for next time popup opens)
  chrome.storage.sync.set({ muteAll: isCurrentlyMuted });

  // Update content script immediately
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: "muteAll", 
        value: isCurrentlyMuted 
      });
    }
  });
});

toggleCheckbox.addEventListener("change", () => {
  enabled = toggleCheckbox.checked;
  container.classList.toggle('disabled', !toggleCheckbox.checked);
  
  chrome.storage.sync.set({ enabled: enabled }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggle" }, (response) => {
          if (chrome.runtime.lastError) { /* Ignore error */ }
        });
      }
    });
  });
});

document.getElementById("add-primary-btn").addEventListener("click", () => addKeyword("new-primary", "keywords", "primary-list"));
document.getElementById("add-secondary-btn").addEventListener("click", () => addKeyword("new-secondary", "secondarykeywords", "secondary-list"));
document.getElementById("add-msg-btn").addEventListener("click", addMessage);

document.getElementById('export-messages').addEventListener('click', () => {
  chrome.storage.sync.get('messages', (data) => {
    const messages = data.messages || [];
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `hh-messages-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

document.getElementById('import-messages').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importedMessages = JSON.parse(event.target.result);
      
      if (!Array.isArray(importedMessages)) {
        alert("Invalid format: Messages must be an array.");
        return;
      }

      if (confirm(`Import ${importedMessages.length} messages? This will overwrite your current list.`)) {
        chrome.storage.sync.set({ messages: importedMessages }, () => {
          // Refresh the UI list
          renderMessages(importedMessages);
          // Notify content script
          updateContentScript();
          alert("Messages imported successfully!");
        });
      }
    } catch (err) {
      alert("Error parsing JSON file.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be imported again if needed
  e.target.value = '';
});

loadSettings();

// Attach listeners to ALL inputs for live-updating and debounced saving
let saveTimeout;
document.querySelectorAll('input, select, textarea').forEach(input => {
  input.addEventListener('input', () => {
    // 1. Instant visual update to the active tab
    updateContentScript(); 

    // 2. Debounced save to storage (waits 500ms after last move)
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const settings = {
        primaryColor: document.getElementById("primaryColor").value,
        primaryColorMid: document.getElementById("primaryColorMid").value,
        primaryColorEnd: document.getElementById("primaryColorEnd").value,
        primaryTextColor: document.getElementById("primaryTextColor").value,
        primaryBorderColor: document.getElementById("primaryBorderColor").value,
        primaryAlpha: parseFloat(document.getElementById("primaryAlpha").value),
        
        secondaryColor: document.getElementById("secondaryColor").value,
        secondaryColorMid: document.getElementById("secondaryColorMid").value,
        secondaryColorEnd: document.getElementById("secondaryColorEnd").value,
        secondaryTextColor: document.getElementById("secondaryTextColor").value,
        secondaryBorderColor: document.getElementById("secondaryBorderColor").value,
        secondaryAlpha: parseFloat(document.getElementById("secondaryAlpha").value),
        
        steamidColor: document.getElementById("steamidColor").value,
        steamidColorMid: document.getElementById("steamidColorMid").value,
        steamidColorEnd: document.getElementById("steamidColorEnd").value,
        steamidTextColor: document.getElementById("steamidTextColor").value,
        // steamidBorderColor: document.getElementById("steamidBorderColor").value,
        steamidAlpha: parseFloat(document.getElementById("steamidAlpha").value),
      };
      chrome.storage.sync.set(settings);
    }, 100);
  });
});