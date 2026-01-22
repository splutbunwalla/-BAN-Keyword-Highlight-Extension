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

	  const parentLine = textNode.parentElement.closest('div, tr, p');
	  if (parentLine) {
		  const lineContent = parentLine.textContent.trim();
		  
		  // Format A: "Player joined/left: [id], [Name] (id: [SteamID])"
		  const logMatch = lineContent.match(/(?:joined|left):\s*\d+,\s*(.*?)\s*\(id:\s*(\d{17})\)/i);
		  
		  // Format B: The Player List Table (player-id name user-id role status)
		  // This helps capture names of people already in the server when you join
		  const tableMatch = lineContent.match(/^\s*\d+\s+([^\d\s][^()]*?)\s+(\d{17})\s+/);
		  
		  let name = null;
		  let id = null;
		  
		  if (logMatch) {
			  name = logMatch[1].trim();
			  id = logMatch[2];
		  } else if (tableMatch) {
			  name = tableMatch[1].trim();
			  id = tableMatch[2];
		  }
		  
		  // Final check: Only save if we found a valid name/id and it's not a header
		  if (name && id && !/^(name|player|user|role|status|id)$/i.test(name)) {
			  // We only update if the name is "cleaner" than what we have
			  // or if we don't have this ID yet.
			  NAME_MAP[id] = name;
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
    
    if (e.ctrlKey) {
      const lineElement = e.target.closest('div, p, tr');
      if (lineElement) {
        let fullText = lineElement.innerText || lineElement.textContent;
        
        // Remove Timestamp
        fullText = fullText.replace(timestampRegex, "").trim();

		// Check if this is a ban message using a flexible Regex
		// This matches ?? even if they are surrounded by weird spaces
		const isBanMessage = /\?\?.*banned\s+by/i.test(fullText);

		if (isBanMessage) {
			console.log(`Matched ban message: ${fullText}`);
			
			// Extract ID: look for 17 digits, with or without parentheses
			const idMatch = fullText.match(/(\d{17})/);
			if (idMatch) {
				const id = idMatch[1];
				const foundName = NAME_MAP[id];
				
				console.log(`ID found: ${id}. Name in map: ${foundName || 'NOT FOUND'}`);
				
				if (foundName) {
					// Replace ?? (and any whitespace around it) with the found name
					fullText = fullText.replace(/\?\?/, foundName).replace(/\s\s+/g, ' ');
				}
			}
		}
        
        copyToClipboard(fullText, lineElement);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

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