const toggleCheckbox = document.getElementById("toggleCheckbox");
const container = document.querySelector('.main-container');
const toggle = document.getElementById('toggleCheckbox');
const muteAllToggle = document.getElementById("muteAllToggle");
const langSelect = document.getElementById("languageSelect");
const speakerIconSVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:block;">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
</svg>`;
let enabled = true;
let isClosing = false;
let debounceTimer;
let KEYWORDS = [];
let SECONDARYWORDS = [];
let activePickr = null;

function closePopup() {
    if (isClosing) return;
    isClosing = true;

    container.classList.add('closing');

    setTimeout(() => {
        window.close();
    }, 140);
}

document.querySelectorAll('.color-swatch').forEach(swatch => {
    const input = document.getElementById(swatch.dataset.target);
    if (input?.value) {
        swatch.style.background = input.value;
    }
});

document.addEventListener('click', (e) => {
    const isInsideContainer = container.contains(e.target);
    const isInsidePickr = e.target.closest('.pcr-app');
    const isSwatch = e.target.classList.contains('color-swatch');
    if (!isInsideContainer && !isInsidePickr && !isSwatch) {
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
        // Primary
        primaryColorFirst: document.getElementById("primaryColorFirst").value,
        primaryColorMiddle: document.getElementById("primaryColorMiddle").value,
        primaryColorEnd: document.getElementById("primaryColorEnd").value,
        primaryTextColor: document.getElementById("primaryTextColor").value,
        primaryBorderColor: document.getElementById("primaryBorderColor").value,

        // Secondary
        secondaryColorFirst: document.getElementById("secondaryColorFirst").value,
        secondaryColorMiddle: document.getElementById("secondaryColorMiddle").value,
        secondaryColorEnd: document.getElementById("secondaryColorEnd").value,
        secondaryTextColor: document.getElementById("secondaryTextColor").value,
        secondaryBorderColor: document.getElementById("secondaryBorderColor").value,

        // SteamID
        steamidColorFirst: document.getElementById("steamidColorFirst").value,
        steamidColorMiddle: document.getElementById("steamidColorMiddle").value,
        steamidColorEnd: document.getElementById("steamidColorEnd").value,
        steamidTextColor: document.getElementById("steamidTextColor").value,
        steamidBorderColor: "#FFFFFF",
		
		preferredLanguage: document.getElementById("languageSelect").value
    };

    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "update", settings: settings});
        }
    });

    // Save to storage
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        chrome.storage.sync.set(settings);
    }, 250);
}

function saveSettingsSilently() {
    chrome.storage.sync.get(["keywords", "secondarykeywords", "messages"], (data) => {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
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
        dingBtn.title = item.ding ? chrome.i18n.getMessage("sound_on") : chrome.i18n.getMessage("sound_off");

        dingBtn.onclick = () => {
            item.ding = !item.ding;

            dingBtn.classList.toggle('active', item.ding);
            dingBtn.title = item.ding ? chrome.i18n.getMessage("sound_on") : chrome.i18n.getMessage("sound_off");

            chrome.storage.sync.set({[storageKey]: words}, () => {
                chrome.tabs.query({active: true, currentWindow: true}, tabs => {
                    if (tabs[0]?.id) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "updateKeywordsOnly", 
                            keywords: storageKey === "keywords" ? words : KEYWORDS,
                            secondarykeywords: storageKey === "secondarykeywords" ? words : SECONDARYWORDS
                        });
                    }
                });
            });
        };

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = item.enabled !== false; 
        cb.onchange = () => {
            words[index].enabled = cb.checked;
            chrome.storage.sync.set({[storageKey]: words}, () => {
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
            chrome.storage.sync.set({[storageKey]: words}, () => {
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
            chrome.storage.sync.set({messages: messages}, () => {
                renderMessages(messages);
                saveSettingsSilently();
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

    const newEntries = rawValue.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    chrome.storage.sync.get([storageKey], (data) => {
        let currentKeywords = data[storageKey] || [];

        newEntries.forEach(word => {
            if (!currentKeywords.some(k => (typeof k === 'string' ? k : k.text) === word)) {
                currentKeywords.push({text: word, enabled: true, ding: true});
            }
        });

        chrome.storage.sync.set({[storageKey]: currentKeywords}, () => {
            input.value = ""; 
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
            msgs.push({label: label || chrome.i18n.getMessage("default_message_label"), text: text});
            chrome.storage.sync.set({messages: msgs}, () => {
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
        "primaryColorFirst", "primaryColorMiddle", "primaryColorEnd", "primaryTextColor", "primaryBorderColor",
        "secondaryColorFirst", "secondaryColorMiddle", "secondaryColorEnd", "secondaryTextColor", "secondaryBorderColor",
        "steamidColorFirst", "steamidColorMiddle", "steamidColorEnd", "steamidTextColor", "preferredLanguage"
    ], (data) => {

        if (data.preferredLanguage) {
            document.getElementById("languageSelect").value = data.preferredLanguage;
        }
		
		updatePopupLanguage(data.preferredLanguage);

        KEYWORDS = data.keywords || [];
        SECONDARYWORDS = data.secondarykeywords || [];
        renderKeywords("primary-list", KEYWORDS, "keywords");
        renderKeywords("secondary-list", SECONDARYWORDS, "secondarykeywords");
        renderMessages(data.messages || []);

        enabled = data.enabled !== false;
        toggleCheckbox.checked = enabled;
        if (muteAllToggle) muteAllToggle.checked = !!data.muteAll;
        container.classList.toggle('disabled', !enabled);

        document.querySelectorAll('.color-swatch').forEach(swatch => {
            const targetId = swatch.dataset.target;
            const input = document.getElementById(targetId);

            const savedColor = data[targetId] || (targetId.includes('TextColor') ? '#ffffff' : '#3399ff');

            if (input) input.value = savedColor;
            swatch.style.backgroundColor = savedColor;
            
            // Localize swatch title based on ID
            swatch.title = chrome.i18n.getMessage(targetId) || targetId;

            const pickr = Pickr.create({
                el: swatch,
                theme: 'nano', 
                default: savedColor,
                padding: 8,
                closeOnScroll: false,
                useAsButton: true, 
                components: {
                    preview: true,
                    opacity: true,
                    hue: true,
                    interaction: {
                        input: true,
                        save: false,
                    }
                }
            });

            pickr.on('change', (color) => {
                const hexa = color.toHEXA().toString();
                swatch.style.backgroundColor = hexa;
                if (input) input.value = hexa;

                updateContentScript();
            });

            pickr.on('show', () => {
                activePickr = pickr;
            });
        });
    });
}


muteAllToggle.addEventListener("change", () => {
    const isCurrentlyMuted = muteAllToggle.checked;
    chrome.storage.sync.set({muteAll: isCurrentlyMuted});

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "muteAll",
                value: isCurrentlyMuted
            });
        }
    });
});

langSelect.addEventListener("change", (e) => {
	updatePopupLanguage(e.target.value);

    updateContentScript();

    localizeHtml();

    renderKeywords("primary-list", KEYWORDS, "keywords");
    renderKeywords("secondary-list", SECONDARYWORDS, "secondarykeywords");
    
    chrome.storage.sync.get("messages", (data) => {
        renderMessages(data.messages || []);
    });
});

toggleCheckbox.addEventListener("change", () => {
    enabled = toggleCheckbox.checked;
    container.classList.toggle('disabled', !toggleCheckbox.checked);

    chrome.storage.sync.set({enabled: enabled}, () => {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "toggle"}, (response) => {
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
        const blob = new Blob([JSON.stringify(messages, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `hh-messages-${new Date().toISOString().slice(0, 10)}.json`;
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
                alert(chrome.i18n.getMessage("error_invalid_format"));
                return;
            }

            if (confirm(chrome.i18n.getMessage("import_confirm_count", [importedMessages.length.toString()]))) {
                chrome.storage.sync.set({messages: importedMessages}, () => {
                    renderMessages(importedMessages);
                    updateContentScript();
                    alert(chrome.i18n.getMessage("import_success"));
                });
            }
        } catch (err) {
            alert(chrome.i18n.getMessage("error_json_parse"));
            console.error(err);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

let saveTimeout;
document.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', () => {
        updateContentScript();

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const settings = {
                primaryColorFirst: document.getElementById("primaryColorFirst").value,
                primaryColorMiddle: document.getElementById("primaryColorMiddle").value,
                primaryColorEnd: document.getElementById("primaryColorEnd").value,
                primaryTextColor: document.getElementById("primaryTextColor").value,
                primaryBorderColor: document.getElementById("primaryBorderColor").value,

                secondaryColorFirst: document.getElementById("secondaryColorFirst").value,
                secondaryColorMiddle: document.getElementById("secondaryColorMiddle").value,
                secondaryColorEnd: document.getElementById("secondaryColorEnd").value,
                secondaryTextColor: document.getElementById("secondaryTextColor").value,
                secondaryBorderColor: document.getElementById("secondaryBorderColor").value,

                steamidColorFirst: document.getElementById("steamidColorFirst").value,
                steamidColorMiddle: document.getElementById("steamidColorMiddle").value,
                steamidColorEnd: document.getElementById("steamidColorEnd").value,
                steamidTextColor: document.getElementById("steamidTextColor").value,
                steamidBorderColor: "#FFFFFF",
				
				preferredLanguage: document.getElementById("languageSelect").value
            };

            chrome.tabs.query({active: true, currentWindow: true}, tabs => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "update", settings: settings});
                }
            });

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                chrome.storage.sync.set(settings);
            }, 100);
        });
    });
});

loadSettings();

let customI18nMessages = null;

async function updatePopupLanguage(lang) {
    if (!lang || lang === "auto") {
        customI18nMessages = null; // Revert to browser default
        localizeHtml();
        return;
    }

    try {
        // Fetch English as the ultimate fallback
        const enRes = await fetch(chrome.runtime.getURL('_locales/en/messages.json'));
        const enMsgs = await enRes.json();

        // Fetch the user's selected language
        const langRes = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        const langMsgs = await langRes.json();

        // Merge: selected language overwrites English where keys exist
        customI18nMessages = { ...enMsgs, ...langMsgs };
    } catch (e) {
        console.error("Failed to fetch localization files:", e);
        customI18nMessages = null; // Fallback to default if files aren't found
    }

    // Refresh the UI with the newly fetched messages
    localizeHtml();
}

// Custom wrapper to get the message
function getI18nMsg(key) {
    if (customI18nMessages && customI18nMessages[key]) {
        return customI18nMessages[key].message;
    }
    // Fallback to Chrome's native i18n if custom isn't loaded or key is missing
    return chrome.i18n.getMessage(key); 
}

function localizeHtml() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const message = getI18nMsg(el.getAttribute('data-i18n'));
        if (message) el.textContent = message;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const messageKey = el.getAttribute('data-i18n-placeholder');
        const message = getI18nMsg(messageKey);
        if (message) el.setAttribute('placeholder', message);
    });
}
localizeHtml();