(() => {
  // Only run inside iframe
  if (window.top === window.self) return;

  let KEYWORDS = [];
  let enabled = true;

  console.log("[Detector] Running inside iframe:", location.href);

  // Load saved keywords & enabled state
  chrome.storage.sync.get(["keywords", "enabled"], data => {
    KEYWORDS = data.keywords?.length ? data.keywords : ["motorhome","race","started","finished"];
    enabled = data.enabled ?? true;
    console.log("[Detector] Loaded keywords:", KEYWORDS, "Enabled:", enabled);
    if (enabled) scan(document.body);
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "toggle") {
      enabled = !enabled;
      console.log("[Detector] Enabled:", enabled);
      if (enabled) scan(document.body);
      else removeAllHighlights();
    }

    if (msg.action === "setKeywords") {
      KEYWORDS = msg.keywords || [];
      console.log("[Detector] Keywords updated:", KEYWORDS);
      removeAllHighlights();
      if (enabled) scan(document.body);
    }

    if (msg.action === "getKeywords") {
      chrome.runtime.sendMessage({
        action: "currentKeywords",
        keywords: KEYWORDS
      });
    }
  });

  // Remove all existing highlights
  function removeAllHighlights() {
    const highlighted = document.querySelectorAll(".hh-highlight");
    highlighted.forEach(span => {
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
    if (!enabled || !KEYWORDS.length) return;
    if (el.nodeType !== Node.ELEMENT_NODE || el.classList.contains("hh-highlight")) return;

    // Only text nodes inside element
    el.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
        let text = child.nodeValue;
        let regex = new RegExp(`(${KEYWORDS.map(escapeRegex).join("|")})`, "gi");
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

  // Scan an element or the whole document
  function scan(node) {
    if (!node) return;
    highlightElement(node);
  }

  // Observe DOM mutations for dynamic content
  function startObserver() {
    const target = document.body;
    if (!target) {
      requestAnimationFrame(startObserver);
      return;
    }

    const observer = new MutationObserver(muts =>
      muts.forEach(m => m.addedNodes.forEach(scan))
    );

    observer.observe(target, { childList: true, subtree: true });
    console.log("[Detector] MutationObserver attached");
  }

  startObserver();
})();
