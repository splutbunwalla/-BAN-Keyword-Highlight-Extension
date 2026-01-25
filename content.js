(() => {
  let KEYWORDS = [], SECONDARYWORDS = [], NAME_MAP = {}, MESSAGES = [];
  let actionMenu = null, scanTimeout = null;
  let isInitializing = false;
  const PERMA_DUR = "307445734561825"; 
  let isRacing = false;
  let banQueue = []; 
  let isProcessingQueue = false; 
  
  // --- UI: QUEUE DISPLAY LOGIC ---
  const updateQueueDisplay = () => {
    let container = document.getElementById('hh-queue-container');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'hh-queue-container';
      
      const header = document.createElement('div');
      header.id = 'hh-queue-header';
      header.innerHTML = `<span>Ban Queue</span><span id="hh-queue-count">0</span>`;
      
      const list = document.createElement('div');
      list.id = 'hh-queue-list';
      
      container.appendChild(header);
      container.appendChild(list);
      document.body.appendChild(container);
    }

    if (banQueue.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    document.getElementById('hh-queue-count').textContent = banQueue.length;

    const list = document.getElementById('hh-queue-list');
    list.innerHTML = ''; 

    banQueue.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'hh-queue-row';
      
      const info = document.createElement('div');
      info.className = 'hh-queue-info';
      info.innerHTML = `
        <span class="hh-queue-name">${item.name}</span>
        <span class="hh-queue-sid">${item.sid}</span>
      `;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'hh-queue-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = "Remove from Queue";
      
      removeBtn.onclick = () => {
        banQueue.splice(index, 1);
        updateQueueDisplay();
      };

      row.appendChild(info);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  };

  // --- CORE LOGIC ---
  const checkRaceStatus = (text) => {
    if (/race\s+started/i.test(text)) {
      if (!isRacing) {
        isRacing = true;
        chrome.runtime.sendMessage({ action: "SET_RACE_MODE", value: true });
        showToast("🏁 Race Mode Active: Bans will be queued");
      }
    } else if (/race\s+finished/i.test(text) || /race\s+abandoned/i.test(text)) {
      if (isRacing) {
        isRacing = false;
        chrome.runtime.sendMessage({ action: "SET_RACE_MODE", value: false });
        processBanQueue();
      }
    }
  };

  const processBanQueue = () => {
    if (banQueue.length === 0) return;
    chrome.runtime.sendMessage({ action: "SET_QUEUE_MODE", value: true });
    let combinedLogs = [];
    
    banQueue.forEach((item, index) => {
      setTimeout(() => {
        const cmd = (item.dur === PERMA_DUR) ? `ban ${item.sid}` : `ban ${item.sid},${item.dur}`;
        chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: cmd });
        
        if (index === banQueue.length - 1) {
          setTimeout(() => { 
            chrome.runtime.sendMessage({ action: "SET_QUEUE_MODE", value: false }); 
          }, 1000);
        }
      }, index * 2000); 

      combinedLogs.push(`${item.name} (${item.sid}) banned for ${item.dur} mins`);
    });

    copyToClipboard(combinedLogs.join("\n"));
    showToast(`Processing ${banQueue.length} queued bans...`);
    banQueue = []; 
    updateQueueDisplay();
  };
  
  const showToast = (msg) => {
    const toast = document.createElement('div');
    toast.className = 'hh-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };
  
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

  const injectToInput = (cmd, autoSubmit = false) => {
    const input = document.getElementById("ContentPlaceHolderMain_ServiceWebConsoleInput1_TextBoxCommand") || 
                  document.querySelector('input[id*="TextBoxCommand"]');

    if (!input) return;

    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeSetter) nativeSetter.call(input, cmd);
    else input.value = cmd;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    if (autoSubmit) {
      setTimeout(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: 'Enter' }));
        input.blur();
        console.log(`🚀 Auto-submitted: ${cmd}`);
      }, 100); 
    }
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

  const applyStyles = (sync) => {
    if (!document.body) return;
    const root = document.documentElement;
    if (sync.steamidColor) root.style.setProperty('--hh-id-bg', hexToRGBA(sync.steamidColor, sync.steamidAlpha ?? 1));
    if (sync.primaryColor) root.style.setProperty('--hh-p-bg', hexToRGBA(sync.primaryColor, sync.primaryAlpha ?? 1));
    if (sync.secondaryColor) root.style.setProperty('--hh-s-bg', hexToRGBA(sync.secondaryColor, sync.secondaryAlpha ?? 1));
    if (sync.enabled === false) document.body.classList.add('hh-disabled');
    else if (sync.enabled === true) document.body.classList.remove('hh-disabled');
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const keys = Object.keys(changes);
      const isColorChange = keys.every(k => k.includes('Color') || k.includes('Alpha') || k === 'enabled');
      if (isColorChange) chrome.storage.sync.get(null, (data) => applyStyles(data));
      else init(); 
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "EXECUTE_COMMAND") {
      let shouldAutoSubmit = false;
      if (msg.cmd.startsWith('kick') && msg.isRacing) shouldAutoSubmit = true;
      if (msg.cmd.startsWith('ban') && msg.isProcessingQueue) shouldAutoSubmit = true;
      // Fixed: msg.cmd.startsWith typo
      if (msg.cmd.startsWith('message')) shouldAutoSubmit = true;

      const input = document.getElementById("ContentPlaceHolderMain_ServiceWebConsoleInput1_TextBoxCommand");
      if (input) {
        console.log(`Console Frame executing: ${msg.cmd} | AutoSubmit: ${shouldAutoSubmit}`);
        injectToInput(msg.cmd, shouldAutoSubmit);
      }
    }
    if (msg.action === "updateColors") applyStyles(msg);
    if (msg.action === "toggle" || msg.action === "updateKeywords") init();
  });
  
  function scan() {
    if (!document.body || document.body.classList.contains('hh-disabled')) return;
    
    document.querySelectorAll('tr, div.log-line, span, td').forEach(el => {
	  const txt = (el.innerText || "").trim();
      if (!txt) return;
      if (el.closest('#hh-queue-container, .hh-action-menu')) return;
       
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

    const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const wordPattern = allWords.map(escape).join('|');
    const regex = new RegExp(`(\\b\\d{17}\\b${wordPattern ? '|' + wordPattern : ''})`, "gi");

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        // Check if the text is inside any of our protected UI elements
        const isUI = n.parentElement.closest(
          ".hh-highlight, .hh-idhighlight, .hh-secondaryhighlight, " +
          "#hh-queue-container, .hh-action-menu, " + // <--- ADDED THESE
          "script, style, textarea, input"
        );
        
        return isUI ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
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
  
  const handleMenuClick = (ev, data, sid) => {
    const item = ev.target.closest('.hh-menu-row, .hh-submenu-item');
    if (!item || item.classList.contains('disabled') || item.getAttribute('data-type') === 'parent') return;

    loadRegistry(); 
    const currentData = NAME_MAP[sid] || data; 

    const type = item.getAttribute('data-type'), 
          conn = item.getAttribute('data-conn');
    let dur = item.getAttribute('data-dur');

    if (type === 'kick') {
      chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: `kick ${conn}` });
    }
    else if (type === 'unban') {
      chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: `unban ${sid}` });
    }
    else if (type === 'role') {
      const roleArg = item.getAttribute('data-role'); 
      let cmd = `role ${sid}`;
      if (roleArg) cmd += `,${roleArg}`;
      chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      showToast(roleArg ? `Setting Role: ${roleArg}` : `Checking Role Status`);
    }
    else if (type === 'ban') {
      if (dur === "custom") {
        dur = prompt("Enter ban duration in minutes:");
        if (!dur || isNaN(dur)) return; 
      }

      if (isRacing) {
        banQueue.push({ sid, name: currentData.name, dur });
        updateQueueDisplay();
        
        if (currentData.online && currentData.connId) {
           chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: `kick ${currentData.connId}` });
           showToast(`Queued Ban & Kicked: ${currentData.name}`);
        } else {
           showToast(`Queued Ban: ${currentData.name} (Offline)`);
        }
      } else {
        const cmd = (dur === PERMA_DUR) ? `ban ${sid}` : `ban ${sid},${dur}`;
        chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: cmd });
        copyToClipboard(`${currentData.name} (${sid}) banned by Server for ${dur} minutes`);
        showToast(`Banned: ${currentData.name}`);
      }
    }
    else if (type === 'msg') {
      const msgText = item.getAttribute('data-text');
      // Added sid to the command so it targets the right player: message <sid>,<text>
      const cmd = `message ${msgText}`;
      chrome.runtime.sendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      showToast(`Message Sent`);
    }     
    else {
      copyToClipboard(sid);
    }
    actionMenu.style.display = 'none';
  };
  
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
        <div class="hh-header-left"><span class="hh-status-dot ${data.online ? 'hh-status-online' : 'hh-status-offline'}"></span><span>${data.name}</span></div>
        <span id="hh-close-x">✕</span>
      </div>
      <div class="hh-menu-row ${!data.online ? 'disabled' : ''}" data-type="kick" data-sid="${sid}" data-conn="${data.connId || ''}">👢 Kick</div>
      <div class="hh-menu-row" data-type="parent" id="hh-ban-row">🔨 Ban
        <div class="hh-submenu" id="hh-ban-submenu">
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="${PERMA_DUR}">🔨 Permanent</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="2880">🔨 2 Days (2880)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="5000">🔨 ~3.5 Days (5000)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="10000">🔨 7 Days (10000)</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="custom">🔨 Custom...</div>
        </div>
      </div>
      <div class="hh-menu-row" data-type="unban" data-sid="${sid}">🔓 Unban ID</div>
      <div class="hh-menu-row" data-type="parent" id="hh-role-row">👤 Role
         <div class="hh-submenu" id="hh-role-submenu">
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="">❔ Check Status</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="vip">⭐ VIP</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="moderator">🛡️ Moderator</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="admin">👑 Admin</div>
         </div>
      </div>
      <div class="hh-menu-row" data-type="parent" id="hh-message-row">💬 Message
        <div class="hh-submenu" id="hh-message-submenu">
          ${MESSAGES.length > 0 
            ? MESSAGES.map(m => {
                const safeText = m.text.replace(/"/g, '&quot;');
                return `<div class="hh-submenu-item" data-type="msg" data-sid="${sid}" data-text="${safeText}">${m.label}</div>`;
              }).join('')
            : '<div class="hh-submenu-item disabled">No messages set</div>'
          }
        </div>
      </div>
      <div class="hh-menu-row" data-type="copy" data-sid="${sid}">📋 Copy ID</div>`;

    actionMenu.onclick = (ev) => handleMenuClick(ev, data, sid);

    actionMenu.style.display = 'flex';
    actionMenu.style.visibility = 'hidden'; 
    const menuWidth = 180;
    const menuHeight = actionMenu.offsetHeight;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const scrollY = window.pageYOffset;
    let x = e.pageX;
    let y = e.pageY;

    if (y + menuHeight > scrollY + viewportHeight) y = (scrollY + viewportHeight) - menuHeight - 10;
    if (y < scrollY) y = scrollY + 10;
    if (x + menuWidth > viewportWidth) x = viewportWidth - menuWidth - 10;

    const subWidth = 160;
    if (x + menuWidth + subWidth > viewportWidth) actionMenu.classList.add('hh-flip-submenu-x');
    else actionMenu.classList.remove('hh-flip-submenu-x');

    const roleRow = actionMenu.querySelector('#hh-role-row');
    const roleRowRect = roleRow.getBoundingClientRect();
    const subHeight = 220; 

    if (roleRowRect.top + subHeight > viewportHeight) actionMenu.classList.add('hh-flip-submenu-y');
    else actionMenu.classList.remove('hh-flip-submenu-y');

    actionMenu.style.left = x + "px";
    actionMenu.style.top = y + "px";
    actionMenu.style.visibility = 'visible';
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
    if (isInitializing) return;
    isInitializing = true;
    try {
      loadRegistry();
      const sync = await chrome.storage.sync.get(null);
      KEYWORDS = sync.keywords || [];
      SECONDARYWORDS = sync.secondarykeywords || [];
      MESSAGES = sync.messages || [];
      
      applyStyles(sync);
      stripHighlights();
      scan();

      if (window.hhObserver) window.hhObserver.disconnect();
      if (document.body) {
		window.hhObserver = new MutationObserver((mutations) => {
		  mutations.forEach(mutation => {
			mutation.addedNodes.forEach(node => {
              if (node.id === 'hh-queue-container' || node.classList?.contains('hh-action-menu') ||
                       (node.parentElement && node.parentElement.closest('#hh-queue-container, .hh-action-menu'))) {
                  return;
                }
			  if (node.nodeType === 3) checkRaceStatus(node.textContent);
			  else if (node.innerText) checkRaceStatus(node.innerText);
			});
		  });
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