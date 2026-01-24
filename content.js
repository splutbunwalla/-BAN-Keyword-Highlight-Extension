(() => {
  let KEYWORDS = [], SECONDARYWORDS = [], NAME_MAP = {};
  let actionMenu = null, scanTimeout = null;
  let isInitializing = false;

  const loadRegistry = () => {
    try {
      const saved = sessionStorage.getItem('hh_registry');
      if (saved) NAME_MAP = JSON.parse(saved);
    } catch (e) { NAME_MAP = {}; }
  };
  const saveRegistry = () => sessionStorage.setItem('hh_registry', JSON.stringify(NAME_MAP));

  const hexToRGBA = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const copyToClipboard = (text) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  };

  const injectToInput = (cmd) => {
    const input = document.getElementById("ContentPlaceHolderMain_ServiceWebConsoleInput1_TextBoxCommand") || 
                  document.querySelector('input[id*="TextBoxCommand"]');
    if (!input) return;
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeSetter) nativeSetter.call(input, cmd);
    else input.value = cmd;
    ['input', 'change', 'keyup'].forEach(evt => input.dispatchEvent(new Event(evt, { bubbles: true })));
  };

  const stripHighlights = () => {
    document.querySelectorAll('.hh-highlight, .hh-secondaryhighlight, .hh-idhighlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    });
  };

  // LIGHTWEIGHT UPDATE: Only changes CSS variables
  const updateStylesOnly = (data) => {
    if (!document.body) return;
    const root = document.documentElement;
    if (data.steamidColor) root.style.setProperty('--hh-id-bg', hexToRGBA(data.steamidColor, data.steamidAlpha ?? 1));
    if (data.primaryColor) root.style.setProperty('--hh-p-bg', hexToRGBA(data.primaryColor, data.primaryAlpha ?? 1));
    if (data.secondaryColor) root.style.setProperty('--hh-s-bg', hexToRGBA(data.secondaryColor, data.secondaryAlpha ?? 1));
    
    if (data.enabled === false) document.body.classList.add('hh-disabled');
    else if (data.enabled === true) document.body.classList.remove('hh-disabled');
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const keys = Object.keys(changes);
      const isColorChange = keys.every(k => k.includes('Color') || k.includes('Alpha') || k === 'enabled');
      
      if (isColorChange) {
        // Just update CSS variables, no scanning
        chrome.storage.sync.get(null, (data) => applyStyles(data));
      } else {
        init(); // Full re-scan for keyword changes
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "EXECUTE_COMMAND") injectToInput(msg.cmd);
    // Messages from popup now only trigger light updates for colors
    if (msg.action === "updateColors") applyStyles(msg);
    if (msg.action === "toggle" || msg.action === "updateKeywords") init();
  });
  
  function scan() {
    if (!document.body || document.body.classList.contains('hh-disabled')) return;
    
    // Data harvesting logic...
    document.querySelectorAll('tr, div.log-line, span, td').forEach(el => {
      const txt = (el.innerText || "").trim();
      if (!txt) return;
      if (['vip', 'admin', 'moderator', 'default'].includes(txt.toLowerCase())) el.classList.add('hh-role-force-white');
      const tableMatch = txt.match(/^(\d+)\s+(.+?)\s+(\d{17})$/);
      const logMatch = txt.match(/(joined|left).*?(\d+),?\s+(.*?)\s*\(id:\s*(\d{17})\)/i);
      if (tableMatch) {
        NAME_MAP[tableMatch[3]] = { name: tableMatch[2].trim(), connId: tableMatch[1], online: true };
        saveRegistry();
      } else if (logMatch) {
        const id = logMatch[4];
        const existing = NAME_MAP[id] || {};
        NAME_MAP[id] = {
          name: logMatch[3].trim() || existing.name || "Unknown",
          connId: logMatch[2] || existing.connId,
          online: logMatch[1].toLowerCase().includes('joined')
        };
        saveRegistry();
      }
    });

    const p = KEYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
    const s = SECONDARYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
    const allWords = [...p, ...s].sort((a, b) => b.length - a.length);
    if (allWords.length === 0 && !document.querySelector('.hh-idhighlight')) return;

    const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const wordPattern = allWords.map(escape).join('|');
    const regex = new RegExp(`(\\b\\d{17}\\b${wordPattern ? '|' + wordPattern : ''})`, "gi");

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement.closest(".hh-highlight, .hh-idhighlight, .hh-secondaryhighlight, script, style, textarea, input") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });

    let nodes = [], n;
    while (n = walker.nextNode()) nodes.push(n);

    nodes.forEach(node => {
      const text = node.nodeValue;
      if (!regex.test(text)) return;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0; regex.lastIndex = 0; let match;
      while ((match = regex.exec(text)) !== null) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        const span = document.createElement('span');
        const m = match[0];
        if (m.length === 17 && /^\d+$/.test(m)) {
           const data = NAME_MAP[m];
           span.className = `hh-idhighlight ${(data && data.online) ? 'hh-online' : 'hh-offline'}`;
           span.textContent = m;
        } else {
           const isPrimary = p.some(k => new RegExp(escape(k), 'i').test(m));
           span.className = isPrimary ? 'hh-highlight' : 'hh-secondaryhighlight';
           span.textContent = m;
        }
        fragment.appendChild(span);
        lastIndex = regex.lastIndex;
      }
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.replaceWith(fragment);
    });
  }

  // ... (contextmenu, click, mouseup listeners remain the same)
  document.addEventListener('contextmenu', (e) => {
    const target = e.target.closest('.hh-idhighlight');
    if (!target) return;
    e.preventDefault();
    if (!actionMenu) {
      actionMenu = document.createElement('div');
      actionMenu.className = 'hh-action-menu';
      document.body.appendChild(actionMenu);
    }
    const sid = target.textContent.trim();
    const data = NAME_MAP[sid] || { name: "Offline Player", connId: null, online: false };
    actionMenu.innerHTML = `
      <div class="hh-menu-header">
        <div style="display:flex; align-items:center;">
          <span class="hh-status-dot ${data.online ? 'hh-status-online' : 'hh-status-offline'}"></span>
          <span>${data.name}</span>
        </div>
        <span id="hh-close-x">✕</span>
      </div>
      <div class="hh-menu-row ${!data.online ? 'disabled' : ''}" data-type="kick" data-sid="${sid}" data-conn="${data.connId || ''}">👢 Kick</div>
      <div class="hh-menu-row" data-type="parent">🔨 Ban
        <div class="hh-submenu">
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="">Permanent</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="2880">2 Days (2880)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="5000">~3.5 Days (5000)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="10000">7 Days (10000)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="custom">Custom...</div>
        </div>
      </div>
      <div class="hh-menu-row" data-type="copy" data-sid="${sid}">📋 Copy ID</div>`;

    actionMenu.onclick = (ev) => {
      const item = ev.target.closest('.hh-menu-row, .hh-submenu-item');
      if (!item || item.classList.contains('disabled') || item.getAttribute('data-type') === 'parent') {
        if (ev.target.id === 'hh-close-x') actionMenu.style.display = 'none';
        return;
      }
      const type = item.getAttribute('data-type'), sid = item.getAttribute('data-sid'), conn = item.getAttribute('data-conn'), dur = item.getAttribute('data-dur');
      let cmd = "";
      if (type === 'kick') cmd = `kick ${conn}`;
      else if (type === 'ban') {
        if (dur === "custom") cmd = `ban ${sid},`;
        else cmd = (dur === "") ? `ban ${sid}` : `ban ${sid},${dur}`;
      } else cmd = sid;
      copyToClipboard(cmd);
      if (type !== 'copy') chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      actionMenu.style.display = 'none';
    };
    actionMenu.style.left = e.pageX + "px";
    actionMenu.style.top = e.pageY + "px";
    actionMenu.style.display = 'flex';
  }, true);

  document.addEventListener('click', (e) => { if (actionMenu && !actionMenu.contains(e.target)) actionMenu.style.display = 'none'; });
  document.addEventListener('mouseup', (e) => {
    if (e.ctrlKey && e.button === 0) {
      const line = e.target.closest('tr, div, p');
      if (!line) return;
      let text = (line.innerText || "").replace(/^\d{2}:\d{2}:\d{2}\.\d{3}:\s*/g, "").replace(/Command:\s*/i, "").trim();
      const idMatch = text.match(/\b\d{17}\b/);
      if (idMatch && NAME_MAP[idMatch[0]]) text = text.replace("??", NAME_MAP[idMatch[0]].name);
      copyToClipboard(text);
      line.style.backgroundColor = 'rgba(255,255,255,0.2)';
      setTimeout(() => { line.style.backgroundColor = ''; }, 200);
    }
  }, true);
  
  const applyStyles = (sync) => {
    if (!document.body) return;
    const root = document.documentElement;
    if (sync.steamidColor) root.style.setProperty('--hh-id-bg', hexToRGBA(sync.steamidColor, sync.steamidAlpha ?? 1));
    if (sync.primaryColor) root.style.setProperty('--hh-p-bg', hexToRGBA(sync.primaryColor, sync.primaryAlpha ?? 1));
    if (sync.secondaryColor) root.style.setProperty('--hh-s-bg', hexToRGBA(sync.secondaryColor, sync.secondaryAlpha ?? 1));
    
    if (sync.enabled === false) document.body.classList.add('hh-disabled');
    else if (sync.enabled === true) document.body.classList.remove('hh-disabled');
  };
  

  const init = async () => {
    if (isInitializing) return;
    isInitializing = true;
    try {
      loadRegistry();
      const sync = await chrome.storage.sync.get(null);
      KEYWORDS = sync.keywords || [];
      SECONDARYWORDS = sync.secondarykeywords || [];
      
      applyStyles(sync); // Update CSS
      stripHighlights(); // Clean DOM
      scan();            // Re-highlight

      if (window.hhObserver) window.hhObserver.disconnect();
      if (document.body) {
        window.hhObserver = new MutationObserver(() => {
          clearTimeout(scanTimeout);
          scanTimeout = setTimeout(scan, 800); 
        });
        window.hhObserver.observe(document.body, { childList: true, subtree: true });
      }
    } finally {
      isInitializing = false;
    }
  };
  
  if (document.body) init();
  else setTimeout(init, 100);
})();