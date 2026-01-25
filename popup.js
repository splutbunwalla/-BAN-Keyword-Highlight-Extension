const primaryColorInput = document.getElementById("primaryColor");
const primaryAlphaInput = document.getElementById('primaryAlpha');
const secondaryColorInput = document.getElementById("secondaryColor");
const secondaryAlphaInput = document.getElementById('secondaryAlpha');
const steamidColorInput = document.getElementById("steamidColor");
const steamidAlphaInput = document.getElementById('steamidAlpha');
const toggleCheckbox = document.getElementById("toggleCheckbox");
const container = document.querySelector('.main-container');
const toggle = document.getElementById('toggleCheckbox');

let enabled = true;
let isClosing = false;

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
    primaryColor: primaryColorInput.value,
    primaryAlpha: parseFloat(primaryAlphaInput.value),
    secondaryColor: secondaryColorInput.value,
    secondaryAlpha: parseFloat(secondaryAlphaInput.value),
    steamidColor: steamidColorInput.value,
    steamidAlpha: parseFloat(steamidAlphaInput.value)
  };

  chrome.storage.sync.set(settings);
  
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "update", settings: settings }, (response) => {
        if (chrome.runtime.lastError) {
        }
      });
    }
  });

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

  const mList = Array.from(document.querySelectorAll("#message-list .keyword-item")).map(item => {
    const labelSpan = item.querySelector(".item-label-text");
    const textSpan = item.querySelector(".item-text-val");
    return {
      label: labelSpan ? labelSpan.textContent.replace(':', '') : "",
      text: textSpan ? textSpan.textContent : ""
    };
  });

  chrome.storage.sync.set({
    keywords: pList,
    secondarykeywords: sList,
    messages: mList
  }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateKeywords",
          keywords: pList,
          secondarykeywords: sList,
          messages: mList
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
    del.className = "delete-btn";
    del.onclick = () => {
      words.splice(index, 1);
      renderKeywords(containerId, words, storageKey);
      saveSettingsSilently();
    };

    div.append(cb, span, del);
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
    "keywords", "secondarykeywords", "messages",
    "primaryColor", "primaryAlpha", 
    "secondaryColor", "secondaryAlpha", 
    "steamidColor", "steamidAlpha", 
    "enabled"
  ], data => {
    const pWords = (data.keywords || []).map(k => typeof k === 'string' ? {text: k, enabled: true} : k);
    const sWords = (data.secondarykeywords || []).map(k => typeof k === 'string' ? {text: k, enabled: true} : k);
    const mList = data.messages || [];
	console.log(`message list : ${mList}`);

    renderKeywords("primary-list", pWords, "keywords");
    renderKeywords("secondary-list", sWords, "secondarykeywords");
    renderMessages(mList);

    primaryColorInput.value = data.primaryColor || "#ffff00";
    primaryAlphaInput.value = data.primaryAlpha !== undefined ? data.primaryAlpha : 0.5;
    secondaryColorInput.value = data.secondaryColor || "#00ff00";
    secondaryAlphaInput.value = data.secondaryAlpha !== undefined ? data.secondaryAlpha : 0.5;
    steamidColorInput.value = data.steamidColor || "#ff8c00";
    steamidAlphaInput.value = data.steamidAlpha !== undefined ? data.steamidAlpha : 0.5;

    // Fixed: Only use the toggleCheckbox since toggleBtn is gone
    enabled = data.enabled !== false;
    toggleCheckbox.checked = enabled;
  });
}

// Fixed: The change listener is now correctly attached to the checkbox
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

loadSettings();

[primaryColorInput, primaryAlphaInput, secondaryColorInput, secondaryAlphaInput, steamidColorInput, steamidAlphaInput].forEach(input => {
  input.addEventListener('input', updateContentScript);
});
