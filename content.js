(() => {
  if (window.top === window.self) return;

  let observer = null; 
  let KEYWORDS = [];
  let SECONDARYWORDS = [];
  let COLORS = { primary: "#ff0033", secondary: "#ffff33", steamidColor: "#ff8c00" }; // Default fallbacks
  let ALPHAS = { primary:1, secondary:1, steamidAlpha:1 }
  let enabled = true;
  let scanTimeout;
  
  function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  function updateStyles(pColor, pAlpha, sColor, sAlpha, idColor, idAlpha) {
	const root = document.documentElement;
    
    // Convert hex + alpha to rgba
    const pRGBA = hexToRGBA(pColor, pAlpha);
    const sRGBA = hexToRGBA(sColor, sAlpha);
    const idRGBA = hexToRGBA(idColor, idAlpha);

    // Set CSS Variables globally
    root.style.setProperty('--hh-primary-bg', pRGBA);
    root.style.setProperty('--hh-secondary-bg', sRGBA);
    root.style.setProperty('--hh-id-bg', idRGBA);
    
    // You can also dynamically set text colors if needed
    root.style.setProperty('--hh-primary-text', 'black');
    root.style.setProperty('--hh-secondary-text', 'black');
    root.style.setProperty('--hh-id-text', 'black');
  }
  
  function debouncedScan(node) {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      if (enabled) scan(document.body);
    }, 150);
  }

  async function init() {
    console.log("[Detector] Initializing iframe logic...");

    const [sync, session] = await Promise.all([
      chrome.storage.sync.get([
        "keywords", "enabled", "secondarykeywords", 
        "primaryColor", "primaryAlpha",
        "secondaryColor", "secondaryAlpha",
        "steamidColor", "steamidAlpha"
      ]),
      chrome.storage.session.get("savedEnabledState")
    ]);
  
    KEYWORDS = sync.keywords?.length ? sync.keywords : ["motorhome", "started", "finished"];
    SECONDARYWORDS = sync.secondarykeywords?.length ? sync.secondarykeywords : [];
	COLORS.primary = sync.primaryColor || "#ffff00";
    COLORS.secondary = sync.secondaryColor || "#00ff00";
	COLORS.steamidColor = sync.steamidColor || "#ff8c00";
	ALPHAS.primary = sync.primaryAlpha || 1;
	ALPHAS.secondary = sync.secondaryAlpha || 1;
	ALPHAS.steamidAlpha = sync.steamidAlpha || 1;
	
	updateStyles(COLORS.primary, ALPHAS.primary, COLORS.secondary, ALPHAS.secondary, COLORS.steamidColor, ALPHAS.steamidAlpha);
	
    enabled = session.savedEnabledState !== undefined ? session.savedEnabledState : (sync.enabled ?? true);
 
    console.log("[Detector] Settings Loaded. Keywords:", KEYWORDS);

    if (enabled) {
      // 2. WAIT FOR DOM: Essential for iframe stability
      if (document.body) {
        startObserver();
      } else {
        // If body is null, wait for DOMContentLoaded or use a small interval
        document.addEventListener('DOMContentLoaded', startObserver);
      }
    }
  }
  
  async function reloadAndPreserve() {
    await chrome.storage.session.set({ "savedEnabledState": enabled });
    enabled = false; // Disable locally to prevent errors during unload
    console.log("[Detector] State saved. Reloading...");
    location.reload();
  }
  
  console.log("[Detector] Running inside iframe:", location.href);

  // Remove all existing highlights
  function removeAllHighlights() {
    const highlighted = document.querySelectorAll(".hh-highlight");
    const secondaryhighlighted = document.querySelectorAll(".hh-secondaryhighlight");
    highlighted.forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize(); // merge adjacent text nodes
      }
    });
    secondaryhighlighted.forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize(); // merge adjacent text nodes
      }
    });
  }

  // Updated Regex Generator to handle non-breaking spaces and correct data types
  function getMasterRegex() {
    const escapeAndFixSpace = (str) => {
      if (!str) return "";
      // Escape regex chars and replace spaces with a pattern that matches any whitespace/nbsp
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s\\u00A0]+");
    };
  
    const processList = (list) => {
      return list
        .filter(k => {
          const isEnabled = typeof k === 'object' ? k.enabled : true;
          const val = typeof k === 'object' ? k.text : k;
          return isEnabled && val && val.trim() !== "";
        })
        .map(k => {
          const val = typeof k === 'object' ? k.text : k;
          return escapeAndFixSpace(val.trim());
        })
        .sort((a, b) => b.length - a.length);
    };
  
    const p = processList(KEYWORDS);
    const s = processList(SECONDARYWORDS);
    const steamIdPattern = "\\b\\d{17}\\b";
  
    let parts = [];
    // Use non-capturing groups inside named groups for stability
    if (p.length) parts.push(`(?<primary>${p.join("|")})`);
    if (s.length) parts.push(`(?<secondary>${s.join("|")})`);
    parts.push(`(?<steamid>${steamIdPattern})`);
  
    return new RegExp(parts.join("|"), "gi");
  }
  
  // Optimized Scanner: Uses capture groups to prevent text deletion
  function highlightUnified(node) {
    if (!enabled || !node) return;
  
    const masterRegex = getMasterRegex();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    const nodesToProcess = [];
  
    let textNode;
    while (textNode = walker.nextNode()) {
      const parent = textNode.parentElement;
      if (parent && (
        parent.tagName === "SCRIPT" || 
        parent.tagName === "STYLE" || 
        parent.closest(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight")
      )) continue;
      nodesToProcess.push(textNode);
    }
  
    nodesToProcess.forEach(child => {
      const text = child.nodeValue;
      if (!text) return;
  
      // Use matchAll to get every instance and its specific group name
      const matches = Array.from(text.matchAll(masterRegex));
      if (matches.length === 0) return;
  
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
  
      for (const match of matches) {
        const { primary, secondary, steamid } = match.groups;
        const matchText = match[0];
        const matchIndex = match.index;
  
        // Append text appearing BEFORE the match
        if (matchIndex > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
        }
  
        // Create the span with the correct class based on which group matched
        const span = document.createElement("span");
        if (primary) span.className = "hh-highlight";
        else if (secondary) span.className = "hh-secondaryhighlight";
        else if (steamid) span.className = "hh-idhighlight";
        
        span.textContent = matchText;
        fragment.appendChild(span);
        
        lastIndex = matchIndex + matchText.length;
      }
  
      // Append remaining text AFTER the last match
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
  
      try {
        child.parentNode.replaceChild(fragment, child);
      } catch (e) {
        console.error("[Detector] Replacement failed:", e);
      }
    });
  }
  
  function scan(node) {
    if (!node) return;
    highlightUnified(node);
  }

  function startObserver() {
    // Safety check for the 'Node' error
    if (!document.body) {
      console.warn("[Detector] Body not found, retrying observer in 500ms...");
      setTimeout(startObserver, 500);
      return;
    }

    if (observer) observer.disconnect();

    observer = new MutationObserver(mutations => {
      const hasChanges = mutations.some(m => 
        m.addedNodes.length > 0 || m.type === 'characterData'
      );
      if (hasChanges) debouncedScan();
    });

    try {
      // Host Havoc console updates often target text nodes (characterData)
      observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        characterData: true 
      });
      console.log("[Detector] MutationObserver successfully attached to", location.href);
      scan(document.body); // Initial scan after successful attachment
    } catch (e) {
      console.error("[Detector] Critical Observer Error:", e);
    }
  }

  // --- MESSAGE LISTENERS ---
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "toggle") {
      enabled = !enabled;
      if (enabled) {
        startObserver();
        scan(document.body);
      } else {
        if (observer) observer.disconnect();
        removeAllHighlights();
      }
    }
	if (msg.action === "updateColors") {
	  // Update local variables
	  COLORS.primary = msg.primaryColor || COLORS.primary;
	  COLORS.secondary = msg.secondaryColor || COLORS.secondary;
	  COLORS.steamidColor = msg.steamidColor || COLORS.steamidColor;
	  
	  // Update Alpha values (using the correct message keys)
	  ALPHAS.primary = msg.primaryAlpha !== undefined ? msg.primaryAlpha : ALPHAS.primary;
	  ALPHAS.secondary = msg.secondaryAlpha !== undefined ? msg.secondaryAlpha : ALPHAS.secondary;
	  ALPHAS.steamidAlpha = msg.steamidAlpha !== undefined ? msg.steamidAlpha : ALPHAS.steamidAlpha;

	  // Apply to DOM
	  updateStyles(
		COLORS.primary, ALPHAS.primary, 
		COLORS.secondary, ALPHAS.secondary, 
		COLORS.steamidColor, ALPHAS.steamidAlpha
	  );
	}

	if (msg.action === "updateKeywords") {
		// getMasterRegex now handles the objects so just make sure they are uptodate
		KEYWORDS = msg.keywords || [];
		SECONDARYWORDS = msg.secondarykeywords || [];

		removeAllHighlights();
		scan(document.body);
	  }
  });

  init();
})();