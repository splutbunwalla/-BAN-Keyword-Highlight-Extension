(() => {
  if (window.top === window.self) return;

  let observer = null; 
  let KEYWORDS = [];
  let SECONDARYWORDS = [];
  let COLORS = { primary: "#ff0033", secondary: "#ffff33", steamidColor: "#ff8c00" };
  let ALPHAS = { primary: 1, secondary: 1, steamidAlpha: 1 };
  let enabled = true;
  let scanTimeout;

  const hexToRGBA = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      // Matches spaces OR non-breaking spaces commonly found in web consoles
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

  function scan(node = document.body) {
    if (!enabled || !node) return;
  
    const masterRegex = getMasterRegex();
  
    // This prevents the entire console from turning white/uppercase
    const darkSpans = node.querySelectorAll('span[style*="rgb(12, 12, 12)"], span[style*="rgb(0, 0, 0)"]');
    
    darkSpans.forEach(span => {
      // Check the parent line to see if it looks like a player row (contains a 17-digit ID)
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
        n.parentElement.closest(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight, .hh-role-highlight, script, style") 
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      )
    });
  
    const nodes = [];
    let n;
    while (n = walker.nextNode()) nodes.push(n);
  
    nodes.forEach(textNode => {
      const text = textNode.nodeValue;
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
  
  // REPLACEMENT: MutationObserver is now more targeted
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => scan(), 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
  }

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
  
  // --- CLICK TO COPY LOGIC ---
  document.addEventListener("click", (e) => {
    // Regex to detect the timestamp pattern: 12:56:19.946:
    const timestampRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}:\s*/;
    
    // 1. Check for CTRL + CLICK (Copy entire line minus timestamp)
    if (e.ctrlKey) {
      // Find the closest line container (div, p, or tr)
      const lineElement = e.target.closest('div, p, tr');
      if (lineElement) {
        const fullText = lineElement.innerText || lineElement.textContent;
        const cleanMessage = fullText.replace(timestampRegex, "").trim();
        
        copyToClipboard(cleanMessage, lineElement);
        // Prevent the "Click on ID" logic from firing if we are doing a line copy
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // 2. Check for NORMAL CLICK on SteamID
    if (e.target.classList.contains("hh-idhighlight")) {
      const steamID = e.target.textContent.trim();
      copyToClipboard(steamID, e.target);
    }
  });

  // Helper function to handle clipboard and feedback
  function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
      // Visual feedback: brief flash
      const originalBg = element.style.backgroundColor;
      element.style.setProperty('background-color', 'rgba(40, 167, 69, 0.5)', 'important');
      setTimeout(() => {
        element.style.backgroundColor = originalBg;
      }, 300);
      console.log("[Detector] Copied:", text);
    }).catch(err => {
      console.error("[Detector] Copy failed:", err);
    });
  }

  // Init
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