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

  // Escape regex characters in keywords
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Highlight keywords inside an element (handles multi-word keywords)
  function highlightElement(el) {
    if (!enabled || !KEYWORDS || KEYWORDS.length === 0 || (KEYWORDS.length === 1 && KEYWORDS[0] === "")) return;
    if (el.nodeType !== Node.ELEMENT_NODE || el.classList.contains("hh-highlight")) return;

    // Filter out empty strings to prevent Regex errors
    const validKeywords = KEYWORDS.filter(k => k.trim() !== "");
    if (validKeywords.length === 0) return;

    el.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
        let text = child.nodeValue;
        let regex = new RegExp(`(${validKeywords.map(escapeRegex).join("|")})`, "gi");
        
        if (!regex.test(text)) return;
        // Wrap matched keywords in span
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        text.replace(regex, (match, _p1, offset) => {
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
          }
          const span = document.createElement("span");
          span.className = "hh-highlight";
          span.textContent = match;
          fragment.appendChild(span);
          lastIndex = offset + match.length;
        });
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        try {
          child.parentNode.replaceChild(fragment, child);
        } catch {
          /* DOM recycled */
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        highlightElement(child);
      }
    });
  }
  
  // Highlight keywords inside an element (handles multi-word keywords)
  function highlightSecondaryElement(el) {
    if (!enabled || !SECONDARYWORDS || SECONDARYWORDS.length === 0 || (SECONDARYWORDS.length === 1 && SECONDARYWORDS[0] === "")) return;
    if (el.nodeType !== Node.ELEMENT_NODE || el.classList.contains("hh-secondaryhighlight")) return;

    // Filter out empty strings to prevent Regex errors
    const validKeywords = SECONDARYWORDS.filter(k => k.trim() !== "");
    if (validKeywords.length === 0) return;
	
    // Only text nodes inside element
    el.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
        let text = child.nodeValue;
        let regex = new RegExp(`(${SECONDARYWORDS.map(escapeRegex).join("|")})`, "gi");
        if (!regex.test(text)) return;

        // Wrap matched keywords in span
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        text.replace(regex, (match, _p1, offset) => {
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
          }
          const span = document.createElement("span");
          span.className = "hh-secondaryhighlight";
          span.textContent = match;
          fragment.appendChild(span);
          lastIndex = offset + match.length;
        });
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        try {
          child.parentNode.replaceChild(fragment, child);
        } catch {
          /* DOM recycled */
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        highlightSecondaryElement(child);
      }
    });
  }
  
  function highlightSteamId(el) {
  if (!enabled) return;
  if (el.nodeType !== Node.ELEMENT_NODE || el.classList.contains("hh-idhighlight")) return;
  
  // Define regex once outside the loop
  const steamIdRegex = /\b\d{17}\b/g;
  
  el.childNodes.forEach(child => {
  	if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
  	let text = child.nodeValue;
  	
  	// Use the pre-defined regex
  	if (!steamIdRegex.test(text)) return;
  	
  	// Reset regex index because of the 'g' flag and the .test() call above
  	steamIdRegex.lastIndex = 0; 
  
  	const fragment = document.createDocumentFragment();
  	let lastIndex = 0;
  	
      text.replace(steamIdRegex, (match, offset) => {
        if (offset > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
        }
        const span = document.createElement("span");
        span.className = "hh-idhighlight";
        span.textContent = match;
        fragment.appendChild(span);
        lastIndex = offset + match.length;
      });

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        try {
          child.parentNode.replaceChild(fragment, child);
        } catch {
          /* DOM recycled */
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        highlightSteamId(child);
      }
	});
  }

  // Scan an element or the whole document
  function scan(node) {
    if (!node) return;
    highlightElement(node);
    highlightSecondaryElement(node);
	highlightSteamId(node);
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
        COLORS.primary = msg.primaryColor || COLORS.primary;
        COLORS.secondary = msg.secondaryColor || COLORS.secondary;
        COLORS.steamidColor = msg.steamidColor || COLORS.steamidColor;
        ALPHAS.primary = msg.primaryAlpha !== undefined ? msg.primaryAlpha : ALPHAS.primary;
        ALPHAS.secondary = msg.secondaryAlpha !== undefined ? msg.secondaryAlpha : ALPHAS.secondary;
        ALPHAS.steamidAlpha = msg.steamidAlpha !== undefined ? msg.steamidAlpha : ALPHAS.steamidAlpha;
        updateStyles(
            COLORS.primary, 
            ALPHAS.primary, 
            COLORS.secondary, 
            ALPHAS.secondary, 
            COLORS.steamidColor, 
            ALPHAS.steamidAlpha
        );
    }
  });

  init();
})();