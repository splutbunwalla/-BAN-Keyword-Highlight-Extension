(() => {
  let KEYWORDS = [], SECONDARYWORDS = [], NAME_MAP = {}, MESSAGES = [], renderList = null;
  let actionMenu = null, scanTimeout = null;
  let restartClickTimer = null;
  let isInitializing = false;
  const PERMA_DUR = "307445734561825"; 
  let isRacing = false;
  let banQueue = []; 
  let isProcessingQueue = false; 
  let chatHistory = [];
  const seenChatLines = new Set();
  const ROLE_WORDS = new Set(['vip', 'admin', 'moderator', 'default']);  
  const ROLE_PATTERN = '\\b(?:vip|admin|moderator|default)\\b';
  let isEnabled = false;
  const ONLINE_TTL = 60_000; // 60 seconds
  let lastDingTime = 0;
  const DING_COOLDOWN = 1500; // ms, prevents spam
  let isMuted = false;

const getKeywordText = k => typeof k === 'string' ? k : k.text;

const updateHeartbeat = () => {
  // 1. Check if we are in the correct frame/page
  const isLogFrame = window.location.href.includes("StreamFile.aspx") || 
                     window.location.href.includes("Proxy.ashx") ||
                     document.querySelector('pre, .log-line, #ConsoleOutput');
  
  if (!isLogFrame) return;

  let dot = document.getElementById('hh-heartbeat');

  // 2. ALWAYS create the dot if it doesn't exist, even if disabled
  if (!dot) {
    dot = document.createElement('div');
    dot.id = 'hh-heartbeat';
    dot.classList.add('pulsing');
    document.body.appendChild(dot);
    console.log("Heartbeat dot initialized");
  }

  // 3. Update the visual state based on isEnabled
  if (isEnabled) {
    dot.style.background = "#00ff00"; // Green
    dot.style.boxShadow = "0 0 5px #00ff00";
    dot.title = "HH Monitor Active";
  } else {
    dot.style.background = "#ffcc00"; // Yellow
    dot.style.boxShadow = "0 0 5px #ffcc00";
    dot.title = "HH Monitor Disabled (Standby)";
  }
};

const pruneOnlineState = () => {
  const now = Date.now();
  let changed = false;

  Object.values(NAME_MAP).forEach(p => {
    if (p.online && p.lastSeen && now - p.lastSeen > ONLINE_TTL) {
      p.online = false;
      changed = true;
    }
  });

  if (changed) {
    saveRegistry();
    if (typeof renderList === 'function') renderList();
  }
};
 
const processJoinLeaveFromText = (text) => {
  const logMatch = text.match(/(joined|left).*?(\d+),?\s+(.*?)\s*\(id:\s*(\d{17})\)/i);
  if (!logMatch) return;

  const joined = logMatch[1].toLowerCase().includes('joined');
  const connId = logMatch[2];
  const name = logMatch[3].trim();
  const id = logMatch[4];

  const existing = NAME_MAP[id] || {};

  NAME_MAP[id] = {
    name: name || existing.name || "Unknown",
    connId: connId || existing.connId,
    online: joined,
    lastSeen: joined ? Date.now() : existing.lastSeen || 0
  };
};

const buildChatHistoryFromDOM = () => {
  chatHistory = []; // reset so reloads don’t duplicate
  seenChatLines.clear();
    
  Object.values(NAME_MAP).forEach(p => {
    p.online = false;
    p.lastSeen = 0;
  });
  
  document.querySelectorAll('tr, div.log-line, pre, span').forEach(el => {
    const text = (el.innerText || "").trim();
    if (!text) return;

    processJoinLeaveFromText(text);
    processChatLog(text);
  });

  saveRegistry();
};

  
const getUIWrapper = () => {
  let wrapper = document.getElementById('hh-ui-wrapper');
  
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'hh-ui-wrapper';
    
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '10px',
      right: '25px',
      display: 'flex',
      flexDirection: 'column', // Stacks Toolbar on top, Queue below
      alignItems: 'flex-end',
      gap: '10px',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });
    
    document.body.appendChild(wrapper);
  }
  return wrapper;
};
  
const updateRaceUI = (active) => {
  const el = document.getElementById('hh-race-status');
  if (!el) return;
  
  if (active) {
    el.innerHTML = '🔴 Race In Progress';
    el.style.background = 'rgba(255, 0, 0, 0.2)';
    el.style.color = '#ff4d4d';
    el.style.border = '1px solid #ff4d4d';
  } else {
    el.innerHTML = '🏁 No Race';
    el.style.background = 'rgba(255, 255, 255, 0.1)';
    el.style.color = '#ccc';
    el.style.border = '1px solid #444';
  }
};

// --- UI: TOOLBAR (Runs in Log Frame) ---
const createToolbar = () => {
 const isLogFrame = window.location.href.includes("StreamFile.aspx") || 
                     window.location.href.includes("Proxy.ashx") ||
                     document.querySelector('pre, .log-line, #ConsoleOutput');
  if (!isLogFrame) return;
  if (document.getElementById('hh-toolbar')) return;

  const wrapper = getUIWrapper();
  
  if (!document.body || !wrapper) {
	console.log("Failing to create toolbar trying again in 500");
	setTimeout(createToolbar, 500);
	return;
  }
			
  const toolbar = document.createElement('div');
  toolbar.id = 'hh-toolbar';
    
  // Standard Tools
  const tools = [
	{ label: 'Chat', type: 'info', icon: '💬', action: 'openChat', desc: 'View player chat logs' },
	{ label: 'Messages', type: 'info', icon: '💬', id: 'hh-msg-trigger', desc: 'Send global announcements' },
    { label: 'Players', type: 'info', icon: '📋', action: 'togglePlayers', desc: 'Show/hide online player list' },
    { label: 'Users', type: 'info', icon: '👥', cmd: 'users', desc: 'List all connected users in console' },
    { label: 'Restart', type: 'danger', icon: '🔄', cmd: 'restart', desc: 'Double-click to RESTART server' }
  ];
  
  tools.forEach(tool => {
    const btn = document.createElement('div');
    btn.className = `hh-tool-btn ${tool.type}`;
    btn.innerHTML = `<span>${tool.icon}</span> ${tool.label}`;
    btn.title = tool.desc;
	
    btn.onclick = (e) => {
      if (tool.id === 'hh-msg-trigger') {
        e.stopPropagation();
        const menu = document.getElementById('hh-toolbar-msg-submenu');
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      } else if (tool.action === 'togglePlayers') {
        togglePlayerList();
      } else if (tool.cmd === 'restart') {
          if (!restartClickTimer) {
          // First click
          restartClickTimer = setTimeout(() => {
            restartClickTimer = null;
            showToast("Double-click to RESTART");
          }, 500); // Window for the second click
        } else {
          // Second click within 500ms
          clearTimeout(restartClickTimer);
          restartClickTimer = null;
          safeSendMessage({ action: "PROXY_COMMAND", cmd: "restart" });
          showToast("🚀 Restarting server...");
        }
      }
	  else if (tool.action === 'openChat') {
        openChatSelector();
	  }
	  else {
        // Standard commands (users, etc.)
        safeSendMessage({ action: "PROXY_COMMAND", cmd: tool.cmd });
        showToast(`Sent: ${tool.label}`);
      }
    };
    toolbar.appendChild(btn);
	
  });
  
  const infoGroup = document.createElement('div');
  infoGroup.className = 'hh-info-group';
  infoGroup.innerHTML = `
    <div id="hh-race-status" class="hh-status-tag" title="Current race state detected from logs">🏁 No Race</div>
    <div id="hh-track-name" class="hh-track-display" title="Last loaded track name">Waiting for track...</div>
  `;
  
  updateRaceUI(isRacing);
  toolbar.appendChild(infoGroup);

  const msgSubmenu = document.createElement('div');
  msgSubmenu.id = 'hh-toolbar-msg-submenu';
  msgSubmenu.className = 'hh-action-menu'; 
  msgSubmenu.style.display = 'none';
  
  toolbar.appendChild(msgSubmenu);
  
  wrapper.prepend(toolbar);
  
  document.addEventListener('click', () => {
    msgSubmenu.style.display = 'none';
  });

  updateToolbarMessages(MESSAGES, msgSubmenu);
};

const openChatSelector = () => {
  const chatView = document.getElementById('hh-chat-view') || createChatView();

  injectChatPlayerDropdown(chatView);

  // Auto-select first online player if none selected
  if (!window.currentViewedId) {
    const firstOnline = Object.entries(NAME_MAP)
      .find(([_, v]) => v.online);

    if (firstOnline) {
      openPlayerChat(firstOnline[0], firstOnline[1].name);
      chatView.querySelector('.hh-chat-player-select').value = firstOnline[0];
    }
  }

  chatView.style.display = 'flex';
};

const injectChatPlayerDropdown = (chatView) => {
  if (chatView.querySelector('.hh-chat-player-select')) return;

  const headerLeft = chatView.querySelector('.hh-header-left');

  const select = document.createElement('select');
  select.className = 'hh-chat-player-select';
  const filter = document.createElement('input');
  filter.type = 'text';
  filter.placeholder = 'filter…';
  filter.className = 'hh-chat-player-filter';

  const rebuildOptions = () => {
    const term = filter.value.toLowerCase().trim();
    select.innerHTML = '';

    // Filter and sort
    const sorted = Object.entries(NAME_MAP)
      .filter(([, data]) =>
        !term || (data.name || '').toLowerCase().includes(term)
      )
      .sort(([, a], [, b]) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      });

    sorted.forEach(([sid, data]) => {
      const opt = document.createElement('option');
      opt.value = sid;
      opt.textContent = `${data.online ? '🟢' : '⚫'} ${data.name}`;
      select.appendChild(opt);
    });

    // Keep current selection if still visible
    if (window.currentViewedId && select.querySelector(`option[value="${window.currentViewedId}"]`)) {
      select.value = window.currentViewedId;
    } else if (sorted.length > 0) {
      // Auto-select first online player
      select.value = sorted[0][0];
      window.currentViewedId = sorted[0][0];
    }

    renderChatLines();
    // Scroll to top after rebuild
    const content = chatView.querySelector('.hh-chat-content');
    if (content) content.scrollTop = 0;
  };

  rebuildOptions();

  select.onchange = () => {
    const sid = select.value;
    const data = NAME_MAP[sid];
    if (data) {
      window.currentViewedId = sid; // Update global
      openPlayerChat(sid, data.name);
    }
  };

  filter.oninput = () => rebuildOptions();
  filter.focus();

  headerLeft.prepend(filter);
  headerLeft.prepend(select);
};

const togglePlayerList = () => {
  let panel = document.getElementById('hh-player-panel');
  if (panel) { 
    panel.remove(); 
    renderList = null; 
    return; 
  }

  panel = document.createElement('div');
  panel.id = 'hh-player-panel';
  panel.innerHTML = `
    <div class="hh-panel-header">
      <span>Online Players</span>
      <input type="text" id="hh-player-search" placeholder="Search...">
      <button id="hh-panel-close">×</button>
    </div>
    <div id="hh-player-list-content"></div>
  `;

  getUIWrapper().appendChild(panel);

  // Define the logic and assign it to the persistent variable
  renderList = (filter = "") => {
    const content = document.getElementById('hh-player-list-content');
    
    // Guard Clause: If the panel was closed, kill the reference
    if (!content) {
      renderList = null;
      return;
    }

    content.innerHTML = "";
    
    // 1. Filter only ONLINE players
    // 2. Sort them alphabetically
    Object.keys(NAME_MAP)
      .filter(id => NAME_MAP[id].online === true)
      .sort((a, b) => (NAME_MAP[a].name || "").localeCompare(NAME_MAP[b].name || ""))
      .forEach(id => {
        const data = NAME_MAP[id];
        // 3. Apply the search filter
        if (data.name.toLowerCase().includes(filter.toLowerCase())) {
          const row = document.createElement('div');
          row.className = 'hh-player-row';
          row.innerHTML = `
            <div class="hh-player-info" title="Click to copy ID">
              <span class="hh-player-name">${data.name}</span>
              <span class="hh-player-id">${id}</span>
            </div>
            <div class="hh-player-actions">
              <button class="hh-btn-profile" title="Profile">P</button>
              <button class="hh-btn-kick" title="Kick">K</button>
              <button class="hh-btn-ban" title="Ban (Perma)">B</button>
            </div>
          `;

          // Copy ID logic
          row.querySelector('.hh-player-info').onclick = () => {
            navigator.clipboard.writeText(id);
            showToast(`Copied ID: ${id}`);
          };

          // Profile Action
          row.querySelector('.hh-btn-profile').onclick = (e) => {
            e.stopPropagation();
            safeSendMessage({ action: "OPEN_TAB", url: `https://steamcommunity.com/profiles/${id}` });
          };
          
          // Kick Action
          row.querySelector('.hh-btn-kick').onclick = (e) => {
            e.stopPropagation();
            safeSendMessage({ action: "PROXY_COMMAND", cmd: `kick ${data.connId}` });
          };

          // Ban Action
          row.querySelector('.hh-btn-ban').onclick = (e) => {
            e.stopPropagation();
            if (confirm(`PERMA BAN ${data.name}?`)) {
              safeSendMessage({ action: "PROXY_COMMAND", cmd: `ban ${id} ${PERMA_DUR}` });
            }
          };

          content.appendChild(row);
        }
      });
  };

  // Setup UI Events
  document.getElementById('hh-player-search').oninput = (e) => renderList(e.target.value);
  document.getElementById('hh-panel-close').onclick = () => {
    panel.remove();
    renderList = null;
  };

  // Initial render
  renderList();
};

const openPlayerChat = (steamId, name) => {
    const chatView = document.getElementById('hh-chat-view') || createChatView();
    const title = chatView.querySelector('.hh-panel-title');
    const searchInput = chatView.querySelector('.hh-chat-search');
    const select = chatView.querySelector('.hh-chat-player-select');

    // Update current viewed player
    window.currentViewedId = steamId;

    // Update panel title
    title.innerText = `Chat: ${name}`;
    if (searchInput) searchInput.value = ''; // Clear search on open

    // Sync dropdown selection
    if (select) {
        select.value = steamId;
    }

    renderChatLines(); // Render lines for this player
    chatView.style.display = 'flex';
};

// Updated render function
const renderChatLines = () => {
    const chatView = document.getElementById('hh-chat-view');
    if (!chatView) return;

    const content = chatView.querySelector('.hh-chat-content');
    if (!content) return;

    content.textContent = ''; // Clear previous

    const select = chatView.querySelector('.hh-chat-player-select');
    const sid = select ? select.value : window.currentViewedId; // Always use dropdown
    const searchInput = chatView.querySelector('.hh-chat-search');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    chatHistory
        .filter(m =>
            m.steamId === sid &&
            (!term || (m.message || '').toLowerCase().includes(term))
        )
        .forEach(m => {
            content.appendChild(buildChatLine(m)); // Make sure buildChatLine is defined
        });
};


function buildChatLine(m) {
    const line = document.createElement('div');
    line.className = 'hh-chat-line';
    line.textContent = `[${m.timestamp}] ${m.name}: ${m.message}`;
    return line;
}

const getVisibleChatText = () => {  
  const chatView = document.getElementById('hh-chat-view');
  if (!chatView) return '';

  const select = chatView.querySelector('.hh-chat-player-select');
  const sid = select ? select.value : window.currentViewedId;
  
  const searchInput = chatView.querySelector('.hh-chat-search');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

  return chatHistory
    .filter(m =>
      m.steamId === sid &&                     // <-- use 'steamId', not 'sid'
      (!term || (m.message || '').toLowerCase().includes(term))
    )
    .map(m => `[${m.timestamp}] ${m.name}: ${m.message}`)
    .join('\n');
};


const downloadTextFile = (text, filename) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function createChatView() {
    const el = document.createElement('div');
    el.id = 'hh-chat-view';
    el.innerHTML = `
        <div class="hh-panel-header">
            <div class="hh-header-left">
                <span class="hh-panel-title">Chat History</span>
            </div>
            <div style="display:flex; align-items:center;">
                <input type="text" class="hh-chat-search" placeholder="Search keywords...">
                <span id="hh-chat-close" style="cursor:pointer;color:#ff4444;font-weight:bold;">✖</span>
            </div>
        </div>
        <div class="hh-chat-content"></div>
        <div class="hh-chat-footer">
			<button id="hh-export-chat" class="hh-tool-btn info">Export</button>
            <button id="hh-copy-chat" class="hh-tool-btn info">Copy Visible</button>
        </div>
    `;
    
    // Search listener
    el.querySelector('.hh-chat-search').oninput = renderChatLines;
    // Add copy logic
    el.querySelector('#hh-copy-chat').onclick = () => {
      const content = el.querySelector('.hh-chat-content').innerText;
      navigator.clipboard.writeText(content);
      showToast("Copied filtered logs!");
    };

    el.querySelector('#hh-export-chat').onclick = () => {
      const text = getVisibleChatText();
      if (!text) {
        showToast("No chat content to export");
        return;
      }
    
      const sid = window.currentViewedId;
      const name = (NAME_MAP[sid]?.name || 'Unknown')
        .replace(/[^\w\d_-]+/g, '_'); // filename-safe
    
      const ts = new Date().toISOString()
        .replace(/[:T]/g, '-')
        .split('.')[0];
    
      const filename = `chat_${name}_${ts}.txt`;
    
      downloadTextFile(text, filename);
      showToast(`Exported chat: ${filename}`);
    };

    document.body.appendChild(el);
    el.querySelector('#hh-chat-close').onclick = () => el.style.display = 'none';
    return el;
}

const updateToolbarMessages = (messages, container) => {
  if (!container) container = document.getElementById('hh-toolbar-msg-submenu');
  if (!container) return;

  container.innerHTML = ''; 

  const globalMessages = messages.filter(m => !m.text.includes('{player}'));

  if (globalMessages.length === 0) {
    container.innerHTML = '<div class="hh-menu-item disabled">No global messages</div>';
    return;
  }

  globalMessages.forEach(msg => {
    const item = document.createElement('div');
    item.className = 'hh-menu-item';
    item.textContent = msg.label || msg.text.substring(0, 20);
    item.title = msg.text;

    item.onclick = (e) => {
      e.stopPropagation();
      
      // CRITICAL CHANGE: We cannot type directly here (wrong frame).
      // We must send a message to the Input Frame.
      safeSendMessage({ action: "PROXY_COMMAND", cmd: `message ${msg.text}` });
      
      showToast(`Signal Sent: ${msg.label}`);
      container.style.display = 'none';
    };
    
    container.appendChild(item);
  });
};
  
  // --- UI: QUEUE DISPLAY ---
  const updateQueueDisplay = () => {
  // Ensure we only draw the queue in the same frame as the toolbar
  const isLogArea = window.location.href.includes("StreamFile") || 
                    window.location.href.includes("Proxy.ashx") ||
                    document.getElementById('ConsoleOutput');
                    
  if (!isLogArea) return;

  const wrapper = getUIWrapper();
  if (!wrapper) return;

  let container = document.getElementById('hh-queue-container');
  if (!container) {
      container = document.createElement('div');
      container.id = 'hh-queue-container';
      container.innerHTML = `
        <div id="hh-queue-header"><span>Ban Queue</span><span id="hh-queue-count">0</span></div>
        <div id="hh-queue-list"></div>
      `;
      wrapper.appendChild(container); // Queue goes below toolbar
    }

    if (banQueue.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'flex';
    
    // Use the container to find sub-elements to avoid null errors
    const countEl = container.querySelector('#hh-queue-count');
    const listEl = container.querySelector('#hh-queue-list');

    if (countEl) countEl.textContent = `${banQueue.length}`;
    if (listEl) {
      listEl.innerHTML = '';banQueue.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'hh-queue-row';
        row.innerHTML = `
          <div class="hh-queue-info">
            <span class="hh-queue-name">${item.name}</span>
            <span class="hh-queue-sid">${item.sid}</span>
          </div>
          <span class="hh-queue-remove">&times;</span>
        `;
        
        row.querySelector('.hh-queue-remove').onclick = () => {
          banQueue.splice(index, 1);
          updateQueueDisplay();
        };
        listEl.appendChild(row);
      });
    }

	if (!document.getElementById('hh-queue-container')) {
      wrapper.appendChild(container);
  }
};
  
  const safeSendMessage = (msg) => {
    try {
  	  if (chrome?.runtime?.id) {
  	    chrome.runtime.sendMessage(msg);
  	  }
    } catch (e) {
  	  // Extension context invalidated — safe to ignore
    }
  };

  // --- CORE LOGIC ---
  const checkRaceStatus = (text, isSilent = false) => {
	if (/Loading\s+Level:/i.test(text)) {
      // Matches "Loading level: " then captures everything until it hits " ("
      const trackMatch = text.match(/Loading\s+level:\s*([^(\n]+)/i);
      if (trackMatch && trackMatch[1]) {
        const trackName = trackMatch[1].trim();
        const trackEl = document.getElementById('hh-track-name');
        if (trackEl) trackEl.textContent = trackName;
      }
    }
	  
    if (/race\s+started/i.test(text)) {
      if (!isRacing) {
        isRacing = true;
        safeSendMessage({ action: "SET_RACE_MODE", value: true });
        if(isSilent) showToast("🏁 Race Mode Active: Bans will be queued");
        updateRaceUI(true); 
      }
    } else if (/race\s+finished/i.test(text) || /race\s+abandoned/i.test(text)) { 
      if (isRacing) {
        isRacing = false;
        safeSendMessage({ action: "SET_RACE_MODE", value: false });
        if(isSilent) showToast("🏁 Race Mode Disabled: Bans no longer queued");
        processBanQueue();
        updateRaceUI(false);
      }
    }
  };


const processChatLog = (text) => {
  const line = text.trim();
  if (!line) return;

  if (seenChatLines.has(line)) return;
  seenChatLines.add(line);

  const chatMatch = line.match(
    /(\d{2}:\d{2}:\d{2}\.\d{3}):\s*Chat:\s*(.*?)\s*\(id:\s*(\d{17})\):\s*(.*)/i
  );
  if (!chatMatch) return;

  const steamId = chatMatch[3];
  const message = chatMatch[4];

  if (NAME_MAP[steamId]) {
    NAME_MAP[steamId].online = true;
    NAME_MAP[steamId].lastSeen = Date.now();
  }

  chatHistory.push({
    fullLine: line,
    timestamp: chatMatch[1],
    name: chatMatch[2],
    steamId,
    message
  });
};

const playDing = () => {
  if (isMuted) return;
  
  const now = Date.now();
  if (now - lastDingTime < DING_COOLDOWN) return;
  lastDingTime = now;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  
  const ctx = new AudioContext();

  // IMPORTANT: Resume context in case it's suspended
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); 
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.5);
};


const scanForKeywords = (text) => {
  const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normMsg = normalize(text);

  const dingKeywords = KEYWORDS.filter(k => k.enabled !== false && k.ding === true);
  const dingSecondWords = SECONDARYWORDS.filter(k2 => k2.enabled !== false && k2.ding === true);

  if (
    dingKeywords.some(k => normMsg.includes(normalize(getKeywordText(k)))) ||
    dingSecondWords.some(k2 => normMsg.includes(normalize(getKeywordText(k2))))
  ) {
    playDing();
  }
};

  const processBanQueue = () => {
    if (banQueue.length === 0) return;
      safeSendMessage({ action: "SET_QUEUE_MODE", value: true });
    let combinedLogs = [];
    
    banQueue.forEach((item, index) => {
      setTimeout(() => {
        const cmd = (item.dur === PERMA_DUR) ? `ban ${item.sid}` : `ban ${item.sid},${item.dur}`;
        safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
        
        if (index === banQueue.length - 1) {
          setTimeout(() => { 
            safeSendMessage({ action: "SET_QUEUE_MODE", value: false }); 
          }, 1000);
        }
      }, index * 2000); 

      combinedLogs.push(`${item.name} (${item.sid}) banned by Server for ${item.dur} mins`);
    });

    copyToClipboard(combinedLogs.join("\n"));
    showToast(`Processing ${banQueue.length} queued bans...`);
    banQueue = []; 
    updateQueueDisplay();
  };
  
  const showToast = (msg) => {
	if (document.body.classList.contains('hh-disabled')) return;
	
	if(!isEnabled) return;
	  
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
	const wrapper = document.getElementById('hh-ui-wrapper');
	
    const hexToRGBA = (hex, alpha) => {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	  };
    // Primary
	root.style.setProperty('--hh-p-bg1', hexToRGBA(sync.primaryColor || "#a70000", sync.primaryAlpha ?? 1));
	root.style.setProperty('--hh-p-bg-mid', hexToRGBA(sync.primaryColorMid || "#000000", sync.primaryAlpha ?? 1));
	root.style.setProperty('--hh-p-bg-end', hexToRGBA(sync.primaryColorEnd || "#ff0000", sync.primaryAlpha ?? 1));
	root.style.setProperty('--hh-p-txt', sync.primaryTextColor || "#ffffff");
	root.style.setProperty('--hh-p-border', sync.primaryBorderColor || "#f13333");   
    
	// Secondary
	root.style.setProperty('--hh-s-bg1', hexToRGBA(sync.secondaryColor || "#a70000", sync.secondaryAlpha ?? 1));
	root.style.setProperty('--hh-s-bg-mid', hexToRGBA(sync.secondaryColorMid || "#000000", sync.secondaryAlpha ?? 1));
	root.style.setProperty('--hh-s-bg-end', hexToRGBA(sync.secondaryColorEnd || "#ff0000", sync.secondaryAlpha ?? 1));
	root.style.setProperty('--hh-s-txt', sync.secondaryTextColor || "#ffffff");
	root.style.setProperty('--hh-s-border', sync.secondaryBorderColor || "#f13333");   
    
    // SteamID
	root.style.setProperty('--hh-id-bg1', hexToRGBA(sync.steamidColor || "#ff8c00", sync.steamidAlpha ?? 0.5));
	root.style.setProperty('--hh-id-bg-mid', hexToRGBA(sync.steamidColorMid || "#ff8c00", sync.steamidAlpha ?? 0.5));
	root.style.setProperty('--hh-id-bg-end', hexToRGBA(sync.steamidColorEnd || "#ff8c00", sync.steamidAlpha ?? 0.5));
	root.style.setProperty('--hh-id-txt', sync.steamidTextColor || "#ffffff");
	root.style.setProperty('--hh-id-border', sync.steamidBorderColor || "#f13333");   
	
	if (sync.enabled === false) {
      document.body.classList.add('hh-disabled');
      if (wrapper) wrapper.style.display = 'none'; // Hide toolbar and queue
      stripHighlights(); // Immediately clear existing highlights
    } else {
      document.body.classList.remove('hh-disabled');
      if (wrapper) wrapper.style.display = 'flex'; // Show toolbar and queue
    }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "EXECUTE_COMMAND") {
      let shouldAutoSubmit = false;
      if (msg.cmd.startsWith('kick') && msg.isRacing) shouldAutoSubmit = true;
      if (msg.cmd.startsWith('ban') && msg.isProcessingQueue) shouldAutoSubmit = true;
      if (msg.cmd.startsWith('message')) shouldAutoSubmit = true;
      if (msg.cmd.startsWith('restart')) shouldAutoSubmit = true;
      if (msg.cmd.startsWith('users')) shouldAutoSubmit = true;

      const input = document.getElementById("ContentPlaceHolderMain_ServiceWebConsoleInput1_TextBoxCommand");
      if (input) {
        injectToInput(msg.cmd, shouldAutoSubmit);
      }
    }
    if (msg.action === "updateColors") applyStyles(msg);
    if (msg.action === "toggle" || msg.action === "updateKeywords") init(); 
	if (msg.action === "updateKeywordsOnly") {
      KEYWORDS = msg.keywords || KEYWORDS;
      SECONDARYWORDS = msg.secondarykeywords || SECONDARYWORDS;
    }
	if (msg.action === "muteAll") {
		isMuted = msg.value;
	}
  });
  
function scan() {
  if (!document.body || document.body.classList.contains('hh-disabled')) return;

  pruneOnlineState();

  const logRoot = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;

  // --- PART 1: Update Name Registry (Player IDs/Names) ---
  // We do this first so the highlighters have the latest 'online' status
  logRoot.querySelectorAll('tr, div.log-line, span, td').forEach(el => {
    const txt = (el.innerText || "").trim();
    if (!txt || el.closest('#hh-ui-wrapper, #hh-player-panel, .hh-action-menu')) return;
     
    const tableMatch = txt.match(/^(\d+)\s+(.+?)\s+(\d{17})$/);
    const logMatch = txt.match(/(joined|left).*?(\d+),?\s+(.*?)\s*\(id:\s*(\d{17})\)/i);

    if (tableMatch) {
      NAME_MAP[tableMatch[3]] = { name: tableMatch[2].trim(), connId: tableMatch[1], online: true };
      saveRegistry();
    } else if (logMatch) {
      const id = logMatch[4];
      const existing = NAME_MAP[id] || {};
      const joined = logMatch[1].toLowerCase().includes('joined');
      
      NAME_MAP[id] = {
        name: logMatch[3].trim() || existing.name || "Unknown",
        connId: logMatch[2] || existing.connId,
        online: joined,
        lastSeen: joined ? Date.now() : existing.lastSeen || 0
      };

      saveRegistry();
    }
  });

  // --- PART 2: Highlighting ---
  const p = KEYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
  const s = SECONDARYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
  const allWords = [...p, ...s].sort((a, b) => b.length - a.length);

  const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const wordPattern = allWords.map(escape).join('|');
  const regex = new RegExp(`(\\b\\d{17}\\b|${ROLE_PATTERN}${wordPattern ? '|' + wordPattern : ''})`, "gi");

  const walker = document.createTreeWalker(logRoot, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      
      // Reject if already highlighted or part of protected UI
      const isUI = parent.closest(
        ".hh-highlight, .hh-idhighlight, .hh-secondaryhighlight, .hh-role-force-white, " +
        "#hh-ui-wrapper, #hh-player-panel, .hh-toast, #hh-chat-view, .hh-action-menu, " +
        "script, style, textarea, input"
      );
      
      return isUI ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let n;
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
      const lower = m.toLowerCase();
      
      if (m.length === 17 && /^\d+$/.test(m)) {
        const data = NAME_MAP[m];
        span.className = `hh-idhighlight ${(data && data.online) ? 'hh-online' : 'hh-offline'}`;
        span.textContent = m;
      } else if (ROLE_WORDS.has(lower)) {
        span.className = 'hh-role-force-white';
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
  
  // Update Player List UI if open
  if (typeof renderList === 'function') {
    renderList(document.getElementById('hh-player-search')?.value || "");
  }
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
      safeSendMessage({ action: "PROXY_COMMAND", cmd: `kick ${conn}` });
    }
    else if (type === 'unban') {
      safeSendMessage({ action: "PROXY_COMMAND", cmd: `unban ${sid}` });
    }
    else if (type === 'role') {
      const roleArg = item.getAttribute('data-role'); 
      let cmd = `role ${sid}`;
      if (roleArg) cmd += `,${roleArg}`;
      safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
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
           safeSendMessage({ action: "PROXY_COMMAND", cmd: `kick ${currentData.connId}` });
           showToast(`Queued Ban & Kicked: ${currentData.name}`);
        } else {
           showToast(`Queued Ban: ${currentData.name} (Offline)`);
        }
      } else {
        const cmd = (dur === PERMA_DUR) ? `ban ${sid}` : `ban ${sid},${dur}`;
        safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
        copyToClipboard(`${currentData.name} (${sid}) banned by Server for ${dur} minutes`);
        showToast(`Banned: ${currentData.name}`);
      }
    }
    else if (type === 'msg') {
      const msgText = item.getAttribute('data-text');
	  
	  let finalText = msgText.replace('{player}',currentData.name);
	  
      const cmd = `message ${finalText}`;
      safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      showToast(`Message Sent`);
    }
	else if (type === 'restart') {
      const cmd = `restart`
      safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      showToast(`Server restarting....`);
	}
	else if (type === 'lookup') {
      safeSendMessage({ action: "OPEN_TAB", url: `https://steamcommunity.com/profiles/${sid}` });
	}
	else if (type === 'users') {
      const cmd = `users`
      safeSendMessage({ action: "PROXY_COMMAND", cmd: cmd });
      showToast(`User listing`);
	}
	else if (type === 'chatlog') {
	  openPlayerChat(sid, currentData.name);
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
			${MESSAGES.filter(m => m.text.includes('{player}')).length > 0 
				  ? MESSAGES.filter(m => m.text.includes('{player}')).map(m => {
					  const safeText = m.text.replace(/"/g, '&quot;');
					  return `<div class="hh-submenu-item" data-type="msg" data-sid="${sid}" data-text="${safeText}">${m.label}</div>`;
					}).join('')
				  : '<div class="hh-submenu-item disabled">No player-specific messages</div>'
				}
        </div>
      </div>
	  <div class="hh-menu-row" data-type="lookup" data-sid="${sid}">🌐 Steam Profile</div>
      <div class="hh-menu-row" data-type="copy" data-sid="${sid}">📋 Copy ID</div>
      <div class="hh-menu-row" data-type="chatlog" data-sid="${sid}">💬 View Chat Logs</div>`;

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
  
// Prime the AudioContext on the first user interaction
const primeAudio = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    const dummyCtx = new AudioContext();
    if (dummyCtx.state === 'suspended') {
      dummyCtx.resume();
    }
  }
  // Remove listener after first interaction to save resources
  document.removeEventListener('mousedown', primeAudio);
  document.removeEventListener('keydown', primeAudio);
};
document.addEventListener('mousedown', primeAudio);
document.addEventListener('keydown', primeAudio);

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

  
// 1. Updated Storage Listener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      chrome.storage.sync.get(null, (data) => {
        // ALWAYS update styles for CSS variables
        applyStyles(data);
        
		if (!isEnabled) {
          // 1. Stop the observer
          if (window.hhObserver) window.hhObserver.disconnect();
          // 2. Clear visual highlights
          stripHighlights();
          // 3. Remove any active toasts immediately
          document.querySelectorAll('.hh-toast').forEach(t => t.remove());
          // 4. Hide UI
          const wrapper = document.getElementById('hh-ui-wrapper');
          if (wrapper) wrapper.style.display = 'none';
          return;
        }
		
		if (changes.muteAll) {
          isMuted = changes.muteAll.newValue;
        }
		
        // Update local variables so scan() uses new words
        KEYWORDS = data.keywords || [];
        SECONDARYWORDS = data.secondarykeywords || [];
        MESSAGES = data.messages || [];

        // If keywords changed, we must re-scan to apply new colors/logic
        if (changes.keywords || changes.secondarykeywords || changes.enabled) {
          stripHighlights(); // Clear old ones
          if (data.enabled !== false) scan(); // Apply new ones
        }

        // Handle Toolbar/UI updates
        if (changes.messages) {
          updateToolbarMessages(MESSAGES);
        }
      });
    }
  });

  // 2. Modified Init to prevent blocking
  const init = async () => {
    if (isInitializing) return;
    isInitializing = true;
    try {
      const sync = await chrome.storage.sync.get(null);
      isEnabled = sync.enabled !== false; // Set this first!
	  
	  updateHeartbeat();
      if (!isEnabled) {
        document.body.classList.add('hh-disabled');
        if (window.hhObserver) window.hhObserver.disconnect();
        stripHighlights();
        const wrapper = document.getElementById('hh-ui-wrapper');
        if (wrapper) wrapper.style.display = 'none';
        return;
      }
      // Update globals immediately
      KEYWORDS = sync.keywords || [];
      SECONDARYWORDS = sync.secondarykeywords || [];
      MESSAGES = sync.messages || [];
      isEnabled = sync.enabled !== false;
	  isMuted = sync.muteAll !== false;

      applyStyles(sync);
      loadRegistry();
      if (!isEnabled) {
        if (window.hhObserver) window.hhObserver.disconnect();
        stripHighlights();
        return;
      }

      // UI needs to be created in the Main Page AND Log Frame
      createToolbar(); 
      updateQueueDisplay();
	  
      const isLogFrame = window.location.href.includes("StreamFile.aspx") || 
                         window.location.href.includes("Proxy.ashx") ||
                         !!document.querySelector('pre, .log-line, #ConsoleOutput');

      if (isLogFrame) {
        buildChatHistoryFromDOM();
        scan();

        const logRoot = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;
        if (window.hhObserver) window.hhObserver.disconnect();
        
        window.hhObserver = new MutationObserver((mutations) => {
          let shouldRescan = false;
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.id === 'hh-ui-wrapper' || (node.classList && node.classList.contains('hh-highlight'))) continue;
              const text = node.nodeType === 3 ? node.textContent : node.innerText;
              if (text) {
				scanForKeywords(text);
                processChatLog(text);
                checkRaceStatus(text, false);
                shouldRescan = true;
              }
            }
          }
          if (shouldRescan) {
			  
			pruneOnlineState();
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(scan, 250);
			const dot = document.getElementById('hh-heartbeat');
			if (dot) {
				dot.style.transform = "scale(1.5)"; // Tiny "blip" when scan happens
				setTimeout(() => dot.style.transform = "scale(1)", 100);
			}
          }
        });
        window.hhObserver.observe(logRoot, { childList: true, subtree: true });
      }
    } finally {
      isInitializing = false;
    }
  };
  
  const startExtension = () => {
    // If body isn't ready, wait 200ms and try again
    if (!document.body) {
      setTimeout(startExtension, 200);
      return;
    }

    // Body exists, now we can safely init
    init();
  };

  startExtension();
})();
