(() => {
  let KEYWORDS = [], SECONDARYWORDS = [], NAME_MAP = {};
  let actionMenu = null, scanTimeout = null;

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
    if (!input) return; // Silent exit if not in this frame

    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeSetter) nativeSetter.call(input, cmd);
    else input.value = cmd;

    ['input', 'change', 'keyup'].forEach(evt => {
      input.dispatchEvent(new Event(evt, { bubbles: true }));
    });
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

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "EXECUTE_COMMAND") {
      injectToInput(msg.cmd);
    }
    if (["updateColors", "toggle", "updateKeywords"].includes(msg.action)) {
      init();
    }
  });

  const updateStyles = (sync) => {
    const root = document.documentElement;
    root.style.setProperty('--hh-id-bg', hexToRGBA(sync.steamidColor || "#ff8c00", sync.steamidAlpha ?? 1));
    root.style.setProperty('--hh-p-bg', hexToRGBA(sync.primaryColor || "#ff0033", sync.primaryAlpha ?? 1));
    root.style.setProperty('--hh-s-bg', hexToRGBA(sync.secondaryColor || "#ffff33", sync.secondaryAlpha ?? 1));
    if (sync.enabled === false) document.body.classList.add('hh-disabled');
    else document.body.classList.remove('hh-disabled');
  };

  function scan() {
    if (!document.body || document.body.classList.contains('hh-disabled')) return;

    // 1. DATA HARVEST
    document.querySelectorAll('tr, div.log-line, span, td').forEach(el => {
      const txt = (el.innerText || "").trim();
      if (!txt) return;

      if (['vip', 'admin', 'moderator', 'default'].includes(txt.toLowerCase())) {
        el.classList.add('hh-role-force-white');
      }

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

    // 2. HIGHLIGHTING
    // CRITICAL FIX: Ensure we only map ENABLED keywords
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
      let lastIndex = 0;
      regex.lastIndex = 0;
      let match;
      
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
      <div class="hh-menu-row" data-type="ban" data-sid="${sid}">🔨 Ban</div>
      <div class="hh-menu-row" data-type="copy" data-sid="${sid}">📋 Copy ID</div>
    `;

    actionMenu.onclick = (ev) => {
      const row = ev.target.closest('.hh-menu-row');
      if (!row || row.classList.contains('disabled')) { actionMenu.style.display = 'none'; return; }
      const type = row.getAttribute('data-type'), sid = row.getAttribute('data-sid'), conn = row.getAttribute('data-conn');
      let cmd = (type === 'kick') ? `kick ${conn}` : (type === 'ban') ? `ban ${sid}` : sid;

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

  const init = async () => {
    loadRegistry();
    const sync = await chrome.storage.sync.get(null);
    KEYWORDS = sync.keywords || [];
    SECONDARYWORDS = sync.secondarykeywords || [];
    updateStyles(sync);
    stripHighlights();
    scan();
    if (window.hhObserver) window.hhObserver.disconnect();
    window.hhObserver = new MutationObserver(() => {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scan, 800); 
    });
    window.hhObserver.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) init();
  else setTimeout(init, 100);
})();