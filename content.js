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

  // CLEANUP: Removed normalize() to prevent MutationObserver loops
  function removeAllHighlights() {
    document.querySelectorAll(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight").forEach(span => {
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

    let parts = [];
    if (p.length) parts.push(`(?<primary>${p.join("|")})`);
    if (s.length) parts.push(`(?<secondary>${s.join("|")})`);
    parts.push(`(?<steamid>${steamId})`);

    return new RegExp(parts.join("|"), "gi");
  }

  function scan(node = document.body) {
    if (!enabled || !node) return;

    const masterRegex = getMasterRegex();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (
        n.parentElement.closest(".hh-highlight, .hh-secondaryhighlight, .hh-idhighlight, script, style") 
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
        
        const span = document.createElement("span");
        const { primary, secondary } = match.groups;
        span.className = primary ? "hh-highlight" : (secondary ? "hh-secondaryhighlight" : "hh-idhighlight");
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