(() => {
  if (window.top === window.self) return;

  let observer = null; 
  let KEYWORDS = [];
  let SECONDARYWORDS = [];
  let COLORS = { primary: "#ff0033", secondary: "#ffff33", steamidColor: "#ff8c00" };
  let ALPHAS = { primary: 1, secondary: 1, steamidAlpha: 1 };
  let NAME_MAP = {};
  let enabled = true;
  let scanTimeout;
  let tooltip = null;
  
  // --- HELPERS ---
  function createTooltip() {
    if (tooltip || !document.body) return; 
    
    tooltip = document.createElement('div');
    tooltip.className = 'hh-tooltip';
    tooltip.style.zIndex = "2147483647";
    document.body.appendChild(tooltip);
  }

  const hexToRGBA = (hex, alpha) => {
    // FIX: Fallback to a default color if hex is missing to prevent .slice() crash
    const safeHex = (hex && typeof hex === 'string' && hex.startsWith('#')) ? hex : "#ff0033";
    const r = parseInt(safeHex.slice(1, 3), 16), 
          g = parseInt(safeHex.slice(3, 5), 16), 
          b = parseInt(safeHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha || 1})`;
  };

  const updateStyles = () => {
    const root = document.documentElement;
    root.style.setProperty('--hh-primary-bg', hexToRGBA(COLORS.primary, ALPHAS.primary));
    root.style.setProperty('--hh-secondary-bg', hexToRGBA(COLORS.secondary, ALPHAS.secondary));
    root.style.setProperty('--hh-id-bg', hexToRGBA(COLORS.steamidColor, ALPHAS.steamidAlpha));
  };

  function removeAllHighlights() {
    document.querySelectorAll(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight, .hh-role-highlight").forEach(span => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
  }

  function getMasterRegex() {
    const escapeAndFixSpace = (str) => {
      if (!str) return "";
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s\\u00A0]+");
    };

    const process = (list) => list
      .filter(k => (typeof k === 'object' ? k.enabled : true) && (typeof k === 'object' ? k.text : k)?.trim())
      .map(k => escapeAndFixSpace((typeof k === 'object' ? k.text : k).trim()))
      .sort((a, b) => b.length - a.length);

    const p = process(KEYWORDS), s = process(SECONDARYWORDS);
    const steamId = "\\b\\d{17}\\b";
    const rolePattern = "\\b(?<role_group>vip|default|moderator|admin)\\b";
    
    let parts = [];
    if (p.length) parts.push(`(?<primary>${p.join("|")})`);
    if (s.length) parts.push(`(?<secondary>${s.join("|")})`);
    parts.push(`(?<role>${rolePattern})`);
    parts.push(`(?<steamid>${steamId})`);

    return new RegExp(parts.join("|"), "gi");
  }

  function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
      const originalBg = element.style.backgroundColor;
      element.style.setProperty('background-color', 'rgba(40, 167, 69, 0.5)', 'important');
      setTimeout(() => {
        element.style.backgroundColor = originalBg;
      }, 300);
    }).catch(err => {
      console.error("[Detector] Copy failed:", err);
    });
  }
  
  // --- MAIN SCANNING CODE ---
  function scan(node = document.body) {
    if (!enabled || !node) return;
  
    const masterRegex = getMasterRegex();
    const darkSpans = node.querySelectorAll('span[style*="rgb(12, 12, 12)"], span[style*="rgb(0, 0, 0)"]');
    
    darkSpans.forEach(span => {
      const parentLine = span.closest('div, tr, p'); 
      const hasSteamId = parentLine && /\b\d{17}\b/.test(parentLine.textContent);
      if (hasSteamId) {
        span.style.setProperty('color', '#ffffff', 'important');
        span.style.setProperty('filter', 'none', 'important');
        span.style.setProperty('text-transform', 'none', 'important');
      }
    });
  
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (
        n.parentElement.closest(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight, .hh-role-highlight, .hh-tooltip, script, style") 
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      )
    });
  
    const nodes = [];
    let n;
    while (n = walker.nextNode()) nodes.push(n);
    
    nodes.forEach(textNode => {
      const text = textNode.nodeValue;
      const parentLine = textNode.parentElement.closest('div, tr, p');
      
      if (parentLine) {
        const lineContent = parentLine.textContent.trim();
        const logMatch = lineContent.match(/(joined|left):\s*(\d+),\s*(.*?)\s*\(id:\s*(\d{17})\)/i);          
        const tableMatch = lineContent.match(/^\s*(\d+)\s+([^\d\s][^()]*?)\s+(\d{17})\s+/);
        
        if (logMatch) {
          const action = logMatch[1].toLowerCase();
          const connId = logMatch[2];
          const name = logMatch[3].trim();
          const steamId = logMatch[4];
          
          if (action === "joined") {
            NAME_MAP[steamId] = { name: name, connId: connId };
          } else {
            if (NAME_MAP[steamId]) NAME_MAP[steamId].connId = null;
            else NAME_MAP[steamId] = { name: name, connId: null };
          }
        } else if (tableMatch) {
          const connId = tableMatch[1];
          const name = tableMatch[2].trim();
          const steamId = tableMatch[3];
          if (steamId && name && !/^(name|player|user|role|status|id)$/i.test(name)) {
            NAME_MAP[steamId] = { name: name, connId: connId };
          }
        }
      }

      const matches = Array.from(text.matchAll(masterRegex));
      if (!matches.length) return;

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;

      for (const match of matches) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        const { primary, secondary, role } = match.groups;
        const span = document.createElement("span");
        if (primary) span.className = "hh-highlight";
        else if (secondary) span.className = "hh-secondaryhighlight";
        else if (role) span.className = "hh-role-highlight";
        else span.className = "hh-idhighlight";
        span.textContent = match[0];
        fragment.appendChild(span);
        lastIdx = match.index + match[0].length;
      }
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
      textNode.replaceWith(fragment);
    });
  }
  
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => scan(), 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
  }

  // --- LISTENERS ---
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "toggle") {
      enabled = !enabled;
      enabled ? startObserver() : (observer?.disconnect(), removeAllHighlights());
    }
    if (msg.action === "updateColors") {
      Object.assign(COLORS, { primary: msg.primaryColor, secondary: msg.secondaryColor, steamidColor: msg.steamidColor });
      Object.assign(ALPHAS, { primary: msg.primaryAlpha, secondary: msg.secondaryAlpha, steamidAlpha: msg.steamidAlpha });
      updateStyles();
    }
    if (msg.action === "updateKeywords") {
      KEYWORDS = msg.keywords || [];
      SECONDARYWORDS = msg.secondarykeywords || [];
      removeAllHighlights();
      scan();
    }
  });  

  // --- CLICK TO COPY & PASTE LOGIC ---
  document.addEventListener("click", (e) => {
    const timestampRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}:\s*/;
    const lineElement = e.target.closest('div, p, tr');
    if (!lineElement) return;
    const fullText = (lineElement.innerText || lineElement.textContent).trim();
    let cmdToPaste = "";

    if (e.altKey) {
      const idMatch = fullText.match(/\b\d{17}\b/);
      if (idMatch) {
        cmdToPaste = `ban ${idMatch[0]}`;
        copyToClipboard(cmdToPaste, lineElement);
      }
    } else if (e.ctrlKey) {
      const idMatch = fullText.match(/\b\d{17}\b/);
      const steamId = idMatch ? idMatch[0] : null;
      const playerListData = steamId ? NAME_MAP[steamId] : null;
      const playerListMatch = fullText.match(/^(\d{1,3})\s+/);
      
      if (playerListMatch) {
        cmdToPaste = `kick ${playerListMatch[1]}`;
      } else if (playerListData && playerListData.connId) {
        // ONLY assign command if player has a connId (is online)
        cmdToPaste = `kick ${playerListData.connId}`;
      } else if (!idMatch && fullText.includes("??")) {
        // Handle ?? replacement logic
        let processedText = fullText.replace(timestampRegex, "").trim();
        const isBanMessage = /\?\?.*banned\s+by/i.test(processedText);
        if (isBanMessage) {
          const bIdMatch = processedText.match(/(\d{17})/);
          if (bIdMatch && NAME_MAP[bIdMatch[1]]) {
            processedText = processedText.replace(/\?\?/, NAME_MAP[bIdMatch[1]].name).replace(/\s\s+/g, ' ');
          }
        }
        copyToClipboard(processedText, lineElement);
      }
    }

    if (cmdToPaste) {
      chrome.storage.local.set({ 'pendingCommand': { cmd: cmdToPaste, time: Date.now() } });
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.target.classList.contains("hh-idhighlight")) {
      copyToClipboard(e.target.textContent.trim(), e.target);
    }
  });

  // --- STORAGE BRIDGE ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingCommand) {
      const newCmd = changes.pendingCommand.newValue.cmd;
      const inputField = document.getElementById('ContentPlaceHolderMain_ServiceWebConsoleInput1_TextBoxCommand') || 
                         document.querySelector('input.riTextBox') ||
                         document.querySelector('input[name*="TextBoxCommand"]');

      if (inputField) {
        inputField.focus();
        inputField.value = ''; 
        try { document.execCommand('insertText', false, newCmd); } 
        catch (e) { inputField.value = newCmd; }
        ['input'].forEach(type => inputField.dispatchEvent(new Event(type, { bubbles: true })));
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!tooltip) createTooltip();
    if (!tooltip) return; 
  
    if (!e.ctrlKey && !e.altKey) {
      tooltip.style.display = 'none';
      return;
    }
  
    const lineElement = e.target.closest('div, p, tr');
    if (!lineElement) {
      tooltip.style.display = 'none';
      return;
    }
  
    const fullText = (lineElement.innerText || lineElement.textContent).trim();
    let preview = "";
    let isOffline = false;
  
    if (e.altKey) {
      const idMatch = fullText.match(/\b\d{17}\b/);
      if (idMatch) {
        const entry = NAME_MAP[idMatch[0]];
        const nameStr = entry ? ` (${entry.name})` : "";
        isOffline = entry && entry.connId === null;
        preview = `🔨 ban ${idMatch[0]}${nameStr}${isOffline ? " [OFFLINE]" : ""}`;
      }
    } else if (e.ctrlKey) {
      const idMatch = fullText.match(/\b\d{17}\b/);
      const steamId = idMatch ? idMatch[0] : null;
      const playerListData = steamId ? NAME_MAP[steamId] : null;
      const playerListMatch = fullText.match(/^(\d{1,3})\s+/);
      
      if (playerListMatch) {
        const nameStr = playerListData ? ` (${playerListData.name})` : "";
        preview = `👢 kick ${playerListMatch[1]}${nameStr}`;
      } else if (playerListData) {
        isOffline = playerListData.connId === null;
        if (isOffline) {
          preview = `👢 kick [OFFLINE] (${playerListData.name})`;
        } else {
          preview = `👢 kick ${playerListData.connId} (${playerListData.name})`;
        }
      } else if (fullText.includes("??")) {
        preview = "📝 Clean & Paste Log Line";
      }
    }
  
    if (preview) {
      tooltip.textContent = preview;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 15) + 'px';
      tooltip.style.top = (e.clientY + 15) + 'px';
      
      // Visual feedback: Use gray border for offline players
      if (isOffline) {
        tooltip.style.borderColor = '#888888';
        tooltip.style.color = '#aaaaaa';
      } else {
        tooltip.style.borderColor = e.altKey ? '#ff0033' : '#ffff33';
        tooltip.style.color = '#ffffff';
      }
    } else {
      tooltip.style.display = 'none';
    }
  });
  
  document.addEventListener('keyup', (e) => { 
      if ((e.key === "Control" || e.key === "Alt") && tooltip) tooltip.style.display = 'none'; 
  });
  
  (async () => {
    const sync = await chrome.storage.sync.get(null);
    KEYWORDS = sync.keywords || ["motorhome", "started", "finished"];
    SECONDARYWORDS = sync.secondarykeywords || [];
    Object.assign(COLORS, { primary: sync.primaryColor, secondary: sync.secondaryColor, steamidColor: sync.steamidColor });
    Object.assign(ALPHAS, { primary: sync.primaryAlpha, secondary: sync.secondaryAlpha, steamidAlpha: sync.steamidAlpha });
    updateStyles();
    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver);
  })();
})();