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
	let modHistory = [];
    const seenChatLines = new Set();
    const ROLE_WORDS = new Set(['vip', 'admin', 'moderator', 'default', 'leader']);
    const ROLE_PATTERN = '\\b(?:vip|admin|moderator|default|leader)\\b';
    let isEnabled = false;
    const ONLINE_TTL = 60_000; // 60 seconds
    let lastDingTime = 0;
    let lastAlarmTime = 0;
    const DING_COOLDOWN = 1500; // ms, prevents spam
    let isMuted = false;
    let didBootstrap = false;
    let compiledRegex = null;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    const getKeywordText = k => typeof k === 'string' ? k : k.text;

	const openModLog = () => {
		const view = document.getElementById('hh-mod-log-view') || createModLogView();
		renderModLines();
		view.style.display = 'flex';
	};

	function createModView() {
		const el = document.createElement('div');
		el.id = 'hh-mod-view';
		el.className = 'hh-chat-view'; // Reusing chat window base styles
		el.innerHTML = `
			<div class="hh-panel-header">
				<div class="hh-header-left">
					<span class="hh-panel-title">🛡️ Moderation Log</span>
				</div>
				<span id="hh-mod-close" style="cursor:pointer;color:#ff4444;font-weight:bold;font-size:18px;">✖</span>
			</div>
			
			<div class="hh-chat-filter-row">
				<select id="hh-mod-filter-type" class="hh-chat-player-select" style="margin:0; width:100px;">
					<option value="all">All Actions</option>
					<option value="KICKED">Kicks</option>
					<option value="BANNED">Bans</option>
				</select>
				
				<input type="text" id="hh-mod-search" class="hh-chat-search" placeholder="Search name/ID..." style="margin:0; flex-grow:1;">
				
				<div style="display:flex; align-items:center; gap:5px;">
					<span style="font-size:10px; color:#888;">From:</span>
					<input type="text" id="hh-mod-time-start" class="hh-chat-time-input" placeholder="00:00:00">
					<span style="font-size:10px; color:#888;">To:</span>
					<input type="text" id="hh-mod-time-end" class="hh-chat-time-input" placeholder="23:59:59">
				</div>
			</div>

			<div class="hh-chat-content" id="hh-mod-content"></div>
			
			<div class="hh-chat-footer">
				<span id="hh-mod-stats" style="font-size:10px; color:#666;">Showing 0 actions</span>
			</div>
		`;
		let wrapper = document.getElementById('hh-ui-wrapper');
		if (!wrapper) {
			wrapper = document.createElement('div');
			wrapper.id = 'hh-ui-wrapper';
			document.body.appendChild(wrapper);
		}
		wrapper.appendChild(el);
		
		// Event Listeners for Live Filtering
		const inputs = ['hh-mod-filter-type', 'hh-mod-search', 'hh-mod-time-start', 'hh-mod-time-end'];
		inputs.forEach(id => {
			el.querySelector(`#${id}`).addEventListener('input', renderModLines);
		});

		el.querySelector('#hh-mod-close').onclick = () => el.style.display = 'none';
		return el;
	}

	const renderModLines = () => {
		const container = document.getElementById('hh-mod-content');
		if (!container) return;

		// Get filter values
		const typeFilter = document.getElementById('hh-mod-filter-type').value;
		const searchText = document.getElementById('hh-mod-search').value.toLowerCase();
		const startTime = document.getElementById('hh-mod-time-start').value;
		const endTime = document.getElementById('hh-mod-time-end').value;

		container.innerHTML = '';
		
		const filtered = modHistory.filter(m => {
			// 1. Action Type Filter
			if (typeFilter !== 'all' && m.action !== typeFilter) return false;

			// 2. Search Text Filter (Name or ID)
			if (searchText && !m.targetName.toLowerCase().includes(searchText) && !m.targetId.includes(searchText)) {
				return false;
			}

			// 3. Timepoint Filter
			if (startTime && m.timestamp < startTime) return false;
			if (endTime && m.timestamp > endTime) return false;

			return true;
		});

		filtered.forEach(m => {
			const line = document.createElement('div');
			line.className = 'hh-mod-line';
			line.style.borderLeft = m.action === 'BANNED' ? '3px solid #ff4444' : '3px solid #ff8800';
			
			const details = m.duration ? ` for <span style="color:#ffcc00">${m.duration} mins</span>` : '';
			const color = m.action === 'BANNED' ? '#ff4444' : '#ffcc00';
			line.innerHTML = `
                <span class="hh-mod-ts">[${m.timestamp}]</span>
                <span class="hh-mod-action" style="color:${color}">${m.action}</span>
                <span class="hh-mod-target">${m.targetName}</span>
                <span style="color:#666">(${m.targetId})</span>
                <span class="hh-mod-admin">by ${m.adminName}</span>
            `;
			container.appendChild(line);
		});

		document.getElementById('hh-mod-stats').innerText = `Showing ${filtered.length} of ${modHistory.length} actions`;
	};
	
	const processModLog = (text) => {
		const line = text.replace(/\u00a0/g, ' ').trim();
		if (!line) return;

		// STEP 1: Capture the Core Event
		// We purposefully match the timestamp, target, and action.
		// We capture EVERYTHING after "by " into a single group called 'details'.
		const coreMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3}):\s+(.*?)\s+\((?:id:\s*)?(\d+)\)\s+(kicked|banned)\s+by\s+(.*)/i);

		if (coreMatch) {
			const timestamp = coreMatch[1];
			const targetName = coreMatch[2].trim();
			const targetId = coreMatch[3];
			const action = coreMatch[4].toUpperCase();
			const rawDetails = coreMatch[5].trim();

			// STEP 2: Parse the "Details" string (Admin, ID, Duration)
			// This handles:
			// "Server"
			// "Server for 99 minutes"
			// "AdminName (12345)"
			// "AdminName (12345) for 99 minutes"
			let actor = rawDetails;
			let actorId = null;
			let duration = null;

			// Try to find duration at the end
			const durMatch = rawDetails.match(/(.*)\s+for\s+(\d+)\s+minutes\s*$/i);
			if (durMatch) {
				actor = durMatch[1].trim(); // "Server" or "Frozeni (123...)"
				duration = durMatch[2];
			}

			// Try to find Admin ID in the actor string
			const idMatch = actor.match(/(.*?)\s+\((?:id:\s*)?(\d+)\)$/i);
			if (idMatch) {
				actor = idMatch[1].trim();
				actorId = idMatch[2];
			}

			// Create Entry
			const entry = {
				timestamp: timestamp,
				targetName: targetName,
				targetId: targetId,
				action: action,
				adminName: actor,
				adminId: actorId, // Might be null if it was just "Server"
				duration: duration,
				raw: line
			};

			// Prevent duplicates
			if (!modHistory.some(m => m.raw === line)) {
				modHistory.push(entry);
				
				// Limit history size to prevent memory issues
				if (modHistory.length > 1000) modHistory.shift();

				// Refresh UI if open
				if (document.getElementById('hh-mod-view')) {
					renderModLines();
				}
			}
		}
	};

    function updateRegex() {
        const p = KEYWORDS.filter(k => k.enabled !== false).map(getKeywordText);
        const s = SECONDARYWORDS.filter(k => k.enabled !== false).map(getKeywordText);
        const allWords = [...p, ...s].sort((a, b) => b.length - a.length);
        const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const wordPattern = allWords.map(escape).join('|');
        compiledRegex = new RegExp(`(\\b\\d{17}\\b|${ROLE_PATTERN}${wordPattern ? '|' + wordPattern : ''})`, "gi");
    }

    const updateHeartbeat = () => {
        const isLogFrame = window.location.href.includes("StreamFile.aspx") ||
            window.location.href.includes("Proxy.ashx") ||
            document.querySelector('pre, .log-line, #ConsoleOutput');

        if (!isLogFrame) return;

        let dot = document.getElementById('hh-heartbeat');

        if (!dot) {
            dot = document.createElement('div');
            dot.id = 'hh-heartbeat';
            dot.classList.add('pulsing');
            document.body.appendChild(dot);
        }

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
            const panel = document.getElementById('hh-player-panel');
            if (panel && typeof renderList === 'function') {
                requestAnimationFrame(() => renderList(
                    document.getElementById('hh-player-search')?.value || ""
                ));
            }
        }
    };

    const getOnlineCount = () =>
        Object.values(NAME_MAP).filter(p => p.online).length;

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

        updateRaceUI(isRacing);

    };

    const buildChatHistoryFromDOM = () => {
        const logRoot = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;
        const rawText = logRoot.innerText || logRoot.textContent;

        // Split by timestamp but KEEP the timestamp in the resulting strings
        // This regex splits at the start of a timestamp without consuming it
        const entries = rawText.split(/(?=\d{2}:\d{2}:\d{2}\.\d{3}:)/);

        console.log(`HH Debug: Bootstrap processing ${entries.length} entries.`);

        entries.forEach(entry => {
            const cleaned = entry.replace(/\u00a0/g, ' ').trim();
			const lower = cleaned.toLowerCase();
            
			if (lower.includes("chat:")) {
                // This now sends the string WITH the timestamp to processChatLog
                processChatLog(cleaned);
            }
			
			if (lower.includes("kicked") || lower.includes("banned")) {
						processModLog(cleaned);
					}
        });

        console.log(`HH Debug: Bootstrap complete. Total chatHistory: ${chatHistory.length}`);
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
                pointerEvents: 'auto'
            });

            document.body.appendChild(wrapper);
        }
        return wrapper;
    };

    const updateRaceUI = (active) => {
        const el = document.getElementById('hh-race-status');
        if (!el) return;

        const count = getOnlineCount();
        const countText = ` (${count}/24)`;

        if (active) {
            el.innerHTML = `🔴 Race In Progress${countText}`;
            el.style.background = 'rgba(255, 0, 0, 0.2)';
            el.style.color = '#ff4d4d';
            el.style.border = '1px solid #ff4d4d';
        } else {
            el.innerHTML = `🏁 No Race${countText}`;
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
            {
                label: 'SID Actions',
                type: 'info',
                icon: '🛠️',
                id: 'hh-sid-trigger',
                desc: 'Role and Ban actions by SteamID'
            },
            {label: 'Chat', type: 'info', icon: '💬', action: 'openChat', desc: 'View player chat logs'},
			{label: 'Mod Log', type: 'info', icon: '🛡️', action: 'openModLog', desc: 'View kick and ban history'},
            {label: 'Messages', type: 'info', icon: '💬', id: 'hh-msg-trigger', desc: 'Send global announcements'},
            {label: 'Players', type: 'info', icon: '📋', action: 'togglePlayers', desc: 'Show/hide online player list'},
            {label: 'Users', type: 'info', icon: '👥', cmd: 'users', desc: 'List all connected users in console'},
            {label: 'Restart', type: 'danger', icon: '🔄', cmd: 'restart', desc: 'Double-click to RESTART server'}
        ];

        tools.forEach(tool => {
            const btn = document.createElement('div');
            btn.className = `hh-tool-btn ${tool.type}`;
            btn.innerHTML = `<span>${tool.icon}</span> ${tool.label}`;
            btn.title = tool.desc;

            btn.onclick = (e) => {
                if (tool.id === 'hh-sid-trigger') {
                    e.stopPropagation();
                    const menu = document.getElementById('hh-toolbar-sid-submenu');
                    // Close other menus
                    document.getElementById('hh-toolbar-msg-submenu').style.display = 'none';
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                } else if (tool.id === 'hh-msg-trigger') {
                    e.stopPropagation();
                    const menu = document.getElementById('hh-toolbar-msg-submenu');
                    // Close other menus
                    document.getElementById('hh-toolbar-sid-submenu').style.display = 'none';
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
                        safeSendMessage({action: "PROXY_COMMAND", cmd: "restart"});
                        showToast("🚀 Restarting server...");
                    }
                } else if (tool.action === 'openChat') {
                    openChatSelector();
                } else if (tool.action === 'perma') {
                    sid = prompt("Enter SteamId to ban:");
                    if (!sid || isNaN(sid)) return;
                    dur = PERMA_DUR;
                    // Chances are not online as will be a perma of an id from a different server
                    if (isRacing) {
                        banQueue.push({sid, dur});
                        updateQueueDisplay();
                        showToast(`Queued Ban: ${sid} (Offline)`);
                    } else {
                        const cmd = `ban ${sid}`;
                        safeSendMessage({
                            action: "PROXY_COMMAND",
                            cmd: cmd,
                            autoSubmit: true
                        });
                        showToast(`Banned: ${sid}`);
                    }
                } else if (tool.action === 'openModLog') {
					const view = document.getElementById('hh-mod-view') || createModView();
					renderModLines();
					view.style.display = 'flex';
				} else {
                    // Standard commands (users, etc.)
                    safeSendMessage({action: "PROXY_COMMAND", cmd: tool.cmd});
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

        // Inside createToolbar, after msgSubmenu creation...

        const sidSubmenu = document.createElement('div');
        sidSubmenu.id = 'hh-toolbar-sid-submenu';
        sidSubmenu.className = 'hh-action-menu';
        sidSubmenu.style.display = 'none';
        sidSubmenu.style.top = '100%';
        sidSubmenu.style.bottom = 'auto';

        const sidActions = [
            {label: '🔨 Permanent Ban', type: 'ban', dur: PERMA_DUR},
            {label: '👤 Set Default', type: 'role', role: 'default'},
            {label: '⭐ Set VIP', type: 'role', role: 'vip'},
            {label: '🛡️ Set Moderator', type: 'role', role: 'moderator'},
            {label: '👑 Set Admin', type: 'role', role: 'admin'}
        ];

        sidActions.forEach(act => {
            const item = document.createElement('div');
            item.className = 'hh-menu-item';
            item.textContent = act.label;
            item.onclick = (e) => {
                e.stopPropagation();
                const sid = prompt(`Enter SteamID for ${act.label}:`);
                if (!sid || isNaN(sid) || sid.length !== 17) return;

                if (isRacing) {
                    outmsg = `Queued: ${sid}`;
                    if (act.type === 'role') {
                        banQueue.push({type: 'role', sid, name: "Manual Entry", role: act.role});
                        outmsg += ` ${act.role}`;
                    } else {
                        banQueue.push({type: 'ban', sid, name: "Manual Entry", dur: act.dur});
                        outmsg += ` banned`;
                    }
                    updateQueueDisplay();
                    showToast(outmsg);
                } else {
                    let cmd = act.type === 'role' ? `role ${sid}${act.role ? ',' + act.role : ''}` : `ban ${sid}`;
                    safeSendMessage({action: "PROXY_COMMAND", cmd: cmd, autoSubmit: true});
                    showToast(`Sent: ${act.label}`);
                }
                sidSubmenu.style.display = 'none';
            };
            sidSubmenu.appendChild(item);
        });

        toolbar.appendChild(sidSubmenu); // Add to toolbar


        wrapper.prepend(toolbar);

        document.addEventListener('click', () => {
            msgSubmenu.style.display = 'none';
            sidSubmenu.style.display = 'none';
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
        filter.placeholder = 'filter users…';
        filter.className = 'hh-chat-player-filter';

        const rebuildOptions = () => {
            const term = filter.value.toLowerCase().trim();
            select.innerHTML = '';

            // Add ALL Option
            const allOpt = document.createElement('option');
            allOpt.value = "ALL";
            allOpt.textContent = "👥 -- ALL PLAYERS --";
            select.appendChild(allOpt);

            // Filter and sort players
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

            // Restore selection or default to ALL
            if (window.currentViewedId && select.querySelector(`option[value="${window.currentViewedId}"]`)) {
                select.value = window.currentViewedId;
            } else {
                select.value = "ALL";
                window.currentViewedId = "ALL";
            }

            renderChatLines();
            const content = chatView.querySelector('.hh-chat-content');
            if (content) content.scrollTop = 0;
        };

        rebuildOptions();

        select.onchange = () => {
            window.currentViewedId = select.value;
            const title = chatView.querySelector('.hh-panel-title');

            if (select.value === 'ALL') {
                title.innerText = `Chat: Global History`;
            } else {
                const data = NAME_MAP[select.value];
                if (data) title.innerText = `Chat: ${data.name}`;
            }
            renderChatLines();
        };

        filter.oninput = () => rebuildOptions();
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
        panel.style.pointerEvents = 'auto';
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
                            safeSendMessage({action: "OPEN_TAB", url: `https://steamcommunity.com/profiles/${id}`});
                        };

                        // Kick Action
                        row.querySelector('.hh-btn-kick').onclick = (e) => {
                            e.stopPropagation();
                            safeSendMessage({action: "PROXY_COMMAND", cmd: `kick ${data.connId}`});
                        };

                        // Ban Action
                        row.querySelector('.hh-btn-ban').onclick = (e) => {
                            e.stopPropagation();
                            safeSendMessage({action: "PROXY_COMMAND", cmd: `ban ${id}`});
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

    const renderChatLines = () => {
        const chatView = document.getElementById('hh-chat-view');
        if (!chatView) return;

        const content = chatView.querySelector('.hh-chat-content');
        if (!content) return;

        content.textContent = '';

        const select = chatView.querySelector('.hh-chat-player-select');
        const sid = select ? select.value : (window.currentViewedId || 'ALL');

        const searchInput = chatView.querySelector('.hh-chat-search');
        const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Get Filter Values
        const startTime = chatView.querySelector('#hh-chat-start')?.value.trim();
        const endTime = chatView.querySelector('#hh-chat-end')?.value.trim();
        const hideServer = chatView.querySelector('#hh-hide-server')?.checked;

        chatHistory
            .filter(m => {
                // 1. Player Filter
                if (sid !== 'ALL' && m.steamId !== sid) return false;

                // 2. Server Filter
                if (hideServer && m.steamId === "0") return false;

                // 3. Text Search
                if (term && (!m.message || !m.message.toLowerCase().includes(term))) return false;

                // 4. Start Time Filter
                if (startTime) {
                    if (m.timestamp === "History") return false; // History has no specific time
                    if (m.timestamp < startTime) return false;
                }

                // 5. End Time Filter
                if (endTime) {
                    if (m.timestamp !== "History" && m.timestamp > endTime) return false;
                }

                return true;
            })
            .forEach(m => {
                content.appendChild(buildChatLine(m));
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
        const sid = select ? select.value : (window.currentViewedId || 'ALL');

        const searchInput = chatView.querySelector('.hh-chat-search');
        const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const startTime = chatView.querySelector('#hh-chat-start')?.value.trim();
        const endTime = chatView.querySelector('#hh-chat-end')?.value.trim();
        const hideServer = chatView.querySelector('#hh-hide-server')?.checked;

        return chatHistory
            .filter(m => {
                if (sid !== 'ALL' && m.steamId !== sid) return false;
                if (hideServer && m.steamId === "0") return false;
                if (term && (!m.message || !m.message.toLowerCase().includes(term))) return false;

                if (startTime) {
                    if (m.timestamp === "History") return false;
                    if (m.timestamp < startTime) return false;
                }
                if (endTime) {
                    if (m.timestamp !== "History" && m.timestamp > endTime) return false;
                }
                return true;
            })
            .map(m => `[${m.timestamp}] ${m.name}: ${m.message}`)
            .join('\n');
    };


    const downloadTextFile = (text, filename) => {
        const blob = new Blob([text], {type: 'text/plain;charset=utf-8;'});
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
        
        <div class="hh-chat-filter-row">
            <input type="text" id="hh-chat-start" class="hh-chat-time-input" placeholder="Start (HH:MM:SS)">
            <input type="text" id="hh-chat-end" class="hh-chat-time-input" placeholder="End (HH:MM:SS)">
            
            <label class="hh-chat-checkbox-label" title="Hide messages from Server (ID: 0)">
                <input type="checkbox" id="hh-hide-server" checked> 
                Hide Server
            </label>
        </div>
        
        <div class="hh-chat-content"></div>
        <div class="hh-chat-footer">
            <button id="hh-export-chat" class="hh-tool-btn info">Export</button>
            <button id="hh-copy-chat" class="hh-tool-btn info">Copy Visible</button>
        </div>
    `;

        // Event Listeners
        el.querySelector('.hh-chat-search').oninput = renderChatLines;
        el.querySelector('#hh-chat-start').oninput = renderChatLines;
        el.querySelector('#hh-chat-end').oninput = renderChatLines;
        el.querySelector('#hh-hide-server').onchange = renderChatLines;

        // Copy Visible
        el.querySelector('#hh-copy-chat').onclick = () => {
            const content = el.querySelector('.hh-chat-content').innerText;
            navigator.clipboard.writeText(content);
            showToast("Copied filtered logs!");
        };

        // Export
        el.querySelector('#hh-export-chat').onclick = () => {
            const text = getVisibleChatText();
            if (!text) {
                showToast("No chat content to export");
                return;
            }

            const sid = window.currentViewedId || "ALL";
            const name = (NAME_MAP[sid]?.name || 'Global_Chat').replace(/[^\w\d_-]+/g, '_');
            const ts = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
            const filename = `chat_${name}_${ts}.txt`;

            downloadTextFile(text, filename);
            showToast(`Exported chat: ${filename}`);
        };
		let wrapper = document.getElementById('hh-ui-wrapper');
		if (!wrapper) {
			wrapper = document.createElement('div');
			wrapper.id = 'hh-ui-wrapper';
			document.body.appendChild(wrapper);
		}
		wrapper.appendChild(el);
        el.querySelector('#hh-chat-close').onclick = () => {
            el.remove();
            window.currentViewedId = null;
        };
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
                safeSendMessage({action: "PROXY_COMMAND", cmd: `message ${msg.text}`});

                showToast(`Signal Sent: ${msg.label}`);
                container.style.display = 'none';
            };

            container.appendChild(item);
        });
    };

    // --- UI: QUEUE DISPLAY ---
    const updateQueueDisplay = () => {
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
        <div id="hh-queue-header"><span>Action Queue</span><span id="hh-queue-count">0</span></div>
        <div id="hh-queue-list"></div>
      `;
            wrapper.appendChild(container);
        }

        if (banQueue.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        const countEl = container.querySelector('#hh-queue-count');
        const listEl = container.querySelector('#hh-queue-list');

        if (countEl) countEl.textContent = `${banQueue.length}`;
        if (listEl) {
            listEl.innerHTML = '';
            banQueue.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'hh-queue-row';

                // --- NEW: Generate label for same-line display ---
                let extraLabel = "";
                if (item.type === 'role') {
                    extraLabel = `<span style="margin-left:8px; color:#00ffff; font-weight:bold;">[Role: ${item.role || 'Check'}]</span>`;
                } else {
                    const d = (item.dur === PERMA_DUR) ? "Perma" : `${item.dur}m`;
                    extraLabel = `<span style="margin-left:8px; color:#ffbc00; font-weight:bold;">[Ban: ${d}]</span>`;
                }

                row.innerHTML = `
          <div class="hh-queue-info">
            <span class="hh-queue-name" style="display:block; font-size:0.9em; opacity:0.8;">${item.name}</span>
            <span class="hh-queue-sid" style="display:flex; align-items:center;">${item.sid} ${extraLabel}</span>
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

        if (!document.getElementById('hh-queue-container')) wrapper.appendChild(container);
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
                safeSendMessage({action: "SET_RACE_MODE", value: true});
                if (isSilent) showToast("🏁 Race Mode Active: Bans will be queued");
                updateRaceUI(true);
            }
        } else if (/race\s+finished/i.test(text) || /race\s+abandoned/i.test(text)) {
            if (isRacing) {
                isRacing = false;
                safeSendMessage({action: "SET_RACE_MODE", value: false});
                if (isSilent) showToast("🏁 Race Mode Disabled: Bans no longer queued");
                processBanQueue();
                updateRaceUI(false);
            }
        }
    };

    const processChatLog = (text) => {
        // 1. Standardize the string (No &nbsp;, trimmed)
        const line = text.replace(/\u00a0/g, ' ').trim();
        if (!line || line.length < 10) return;

        // 2. Duplicate Check
        // If we already saw this exact timestamp + message, stop immediately.
        if (seenChatLines.has(line)) return;
        seenChatLines.add(line);

        // 3. Regex (Flexible for both Timestamp and Non-Timestamp lines)
        const chatMatch = line.match(/(?:(\d{2}:\d{2}:\d{2}\.\d{3}):\s*)?Chat:\s*(.*?)\s*\(id:\s*(\d+)\):\s*(.*)/i);

        if (chatMatch) {
            const timestamp = chatMatch[1] || "History";
            const name = chatMatch[2].trim();
            const steamId = chatMatch[3].trim();
            const message = chatMatch[4].trim();

            // 4. Verification Check
            // If it's a "History" tag, check if we already have this message with a real timestamp
            // to prevent [History] vs [23:00:00] duplicates
            if (timestamp === "History") {
                const isDuplicate = chatHistory.some(h =>
                    h.name === name && h.message === message && h.steamId === steamId
                );
                if (isDuplicate) return;
            }

            chatHistory.push({timestamp, name, steamId, message});

            if (chatHistory.length > 5000) chatHistory.shift();
            if (window.currentViewedId === steamId) renderChatLines();
        }
    };

    const playDing = () => {
        if (isMuted) return;
        if (!audioCtx || audioCtx.state !== 'running') return;

        const now = Date.now();
        if (now - lastDingTime < DING_COOLDOWN) return;
        lastDingTime = now;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);

        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    };

    const playAlarm = () => {
        if (isMuted) return;
        if (!audioCtx || audioCtx.state !== 'running') return;

        const now = Date.now();
        if (now - lastAlarmTime < DING_COOLDOWN) return;

        lastAlarmTime = now;
        // Create two oscillators for a "thick" dissonant sound
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();

        // 440Hz and 445Hz create a jarring interference pattern
        osc1.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc2.frequency.setValueAtTime(445, audioCtx.currentTime);

        // Use 'sawtooth' or 'square' for a harsher, more "alarm-like" buzz
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);

        // Connect both to the same gain node
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc1.start();
        osc2.start();
        // Stop after a short burst
        osc1.stop(audioCtx.currentTime + 0.3);
        osc2.stop(audioCtx.currentTime + 0.3);
    };


    const scanForKeywords = (text) => {
        const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const normMsg = normalize(text);

        const dingKeywords = KEYWORDS.filter(k => k.enabled !== false && k.ding === true);
        const dingSecondWords = SECONDARYWORDS.filter(k2 => k2.enabled !== false && k2.ding === true);

        if (dingKeywords.some(k => normMsg.includes(normalize(getKeywordText(k))))) {
            playAlarm();
        }

        if (dingSecondWords.some(k2 => normMsg.includes(normalize(getKeywordText(k2))))) {
            playDing();
        }
    };

    const processBanQueue = () => {
        if (banQueue.length === 0) return;
        safeSendMessage({action: "SET_QUEUE_MODE", value: true});
        let combinedLogs = [];

        banQueue.forEach((item, index) => {
            setTimeout(() => {
                let cmd;
                if (item.type === 'role') {
                    cmd = `role ${item.sid}`;
                    if (item.role) cmd += `,${item.role}`;
                    combinedLogs.push(`${item.name} (${item.sid}) role set to ${item.role || 'Check'} by Server`);
                    console.log(combinedLogs);
                } else {
                    // Default to Ban
                    cmd = (item.dur === PERMA_DUR) ? `ban ${item.sid}` : `ban ${item.sid},${item.dur}`;
                    combinedLogs.push(`${item.name} (${item.sid}) banned by Server for ${item.dur} mins`);
                }

                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd, autoSubmit: true});

                if (index === banQueue.length - 1) {
                    setTimeout(() => {
                        safeSendMessage({action: "SET_QUEUE_MODE", value: false});
                    }, 1000);
                }
            }, index * 2000);
        });

        copyToClipboard(combinedLogs.join("\n"));
        showToast(`Processing ${banQueue.length} queued actions...`);
        banQueue = [];
        updateQueueDisplay();
    };

    const showToast = (msg) => {
        if (document.body.classList.contains('hh-disabled')) return;

        if (!isEnabled) return;

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
        } catch (e) {
            NAME_MAP = {};
        }
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

        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));

        if (autoSubmit) {
            setTimeout(() => {
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    keyCode: 13,
                    which: 13,
                    key: 'Enter'
                }));
                input.dispatchEvent(new KeyboardEvent('keypress', {
                    bubbles: true,
                    cancelable: true,
                    keyCode: 13,
                    which: 13,
                    key: 'Enter'
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    bubbles: true,
                    cancelable: true,
                    keyCode: 13,
                    which: 13,
                    key: 'Enter'
                }));
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

        // Primary Colors (Pickr strings already contain alpha)
        root.style.setProperty('--hh-p-bg1', sync.primaryColorFirst);
        root.style.setProperty('--hh-p-bg-mid', sync.primaryColorMiddle);
        root.style.setProperty('--hh-p-bg-end', sync.primaryColorEnd);
        root.style.setProperty('--hh-p-txt', sync.primaryTextColor);
        root.style.setProperty('--hh-p-border', sync.primaryBorderColor);

        // Secondary Colors
        root.style.setProperty('--hh-s-bg1', sync.secondaryColorFirst);
        root.style.setProperty('--hh-s-bg-mid', sync.secondaryColorMiddle);
        root.style.setProperty('--hh-s-bg-end', sync.secondaryColorEnd);
        root.style.setProperty('--hh-s-txt', sync.secondaryTextColor);
        root.style.setProperty('--hh-s-border', sync.secondaryBorderColor);

        // SteamID Colors
        root.style.setProperty('--hh-id-bg1', sync.steamidColorFirst);
        root.style.setProperty('--hh-id-bg-mid', sync.steamidColorMiddle);
        root.style.setProperty('--hh-id-bg-end', sync.steamidColorEnd);
        root.style.setProperty('--hh-id-txt', sync.steamidTextColor);


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

            if (msg.autoSubmit) shouldAutoSubmit = true;

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

    function bootstrapOnlineFromHistory() {
        const now = Date.now();

        // Start pessimistic
        Object.values(NAME_MAP).forEach(p => {
            p.online = false;
            p.lastSeen = 0;
        });

        document.querySelectorAll('tr, div.log-line, pre, span').forEach(el => {
            const text = (el.innerText || "").trim();
            if (!text) return;

            // Reuse your *existing* parsers
            processJoinLeaveFromText(text);
            processChatLog(text);

			if (text.toLowerCase().includes("kicked") || text.toLowerCase().includes("banned")) {
				processModLog(text);
}
        });

        // Anyone who chatted but never had join logged
        Object.values(NAME_MAP).forEach(p => {
            if (p.lastSeen && !p.online) {
                p.online = true;
                p.lastSeen = now;
            }
        });

        saveRegistry();
    }

    function scan() {
        if (!document.body || document.body.classList.contains('hh-disabled')) return;

        const logRoot = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;
        let dataChanged = false;
        let tableFoundInThisScan = false;

        // --- PART 1: DATA EXTRACTION (Robust Text Parsing) ---
        // We read the entire log text, normalize spaces, and split by line.
        // This ensures we catch the table row even if it's split across 10 different spans.
        const fullText = (logRoot.innerText || "").replace(/[\u00a0\t]/g, ' ');
        const lines = fullText.split('\n');

        lines.forEach(line => {
            const txt = line.trim();
            if (!txt) return;

            const tableMatch = txt.match(/^\s*(\d+)\s+(.+?)\s+(\d{17})\s+(vip|admin|moderator|default|leader)(?:\s+|$)/i);
            const logMatch = txt.match(/(joined|left).*?(\d+),?\s+(.*?)\s*\(id:\s*(\d{17})\)/i);

            if (tableMatch) {
                tableFoundInThisScan = true;
                const id = tableMatch[3];
                const role = tableMatch[4].toLowerCase();

                if (!NAME_MAP[id] || !NAME_MAP[id].online) {
                    NAME_MAP[id] = {
                        name: tableMatch[2].trim(),
                        connId: tableMatch[1],
                        online: true,
                        role: role, // Store the role
                        lastSeen: Date.now()
                    };
                    dataChanged = true;
                } else {
                    NAME_MAP[id].lastSeen = Date.now();
                }
            } else if (logMatch) {
                const id = logMatch[4];
                const existing = NAME_MAP[id] || {};
                const joined = logMatch[1].toLowerCase().includes('joined');

                // Only update if status actually changes to avoid spamming saveRegistry
                if (existing.online !== joined) {
                    NAME_MAP[id] = {
                        name: logMatch[3].trim() || existing.name || "Unknown",
                        connId: logMatch[2] || existing.connId,
                        online: joined,
                        lastSeen: joined ? Date.now() : (existing.lastSeen || 0)
                    };
                    dataChanged = true;
                }
            }
        });

        if (dataChanged) {
            saveRegistry();
            // Force immediate UI update
            if (renderList) renderList(document.getElementById('hh-player-search')?.value || "");
            updateRaceUI(isRacing);
        }

        // --- PART 2: Highlighting (Standard Logic) ---
        const p = KEYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
        const s = SECONDARYWORDS.filter(k => k.enabled !== false).map(k => typeof k === 'string' ? k : k.text).filter(Boolean);
        const allWords = [...p, ...s].sort((a, b) => b.length - a.length);

        const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const wordPattern = allWords.map(escape).join('|');
        const regex = new RegExp(`(\\b\\d{17}\\b|${ROLE_PATTERN}${wordPattern ? '|' + wordPattern : ''})`, "gi");

        const walker = document.createTreeWalker(logRoot, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                if (n.parentElement.classList.contains('hh-highlight') ||
                    n.parentElement.classList.contains('.hh-secondaryhighlight') ||
                    n.parentElement.classList.contains('hh-idhighlight')) {
                    return NodeFilter.FILTER_REJECT;
                }
                const parent = n.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const isUI = parent.closest(
                    ".hh-highlight, .hh-idhighlight, .hh-secondaryhighlight, .hh-role-force-white, " +
                    "#hh-ui-wrapper, #hh-player-panel, .hh-toast, #hh-chat-view, .hh-action-menu, " + 
					".hh-mod-view, .hh-chat-content, script, style, textarea, input"
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

        return tableFoundInThisScan;
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
            safeSendMessage({action: "PROXY_COMMAND", cmd: `kick ${conn}`});
        } else if (type === 'unban') {
            safeSendMessage({action: "PROXY_COMMAND", cmd: `unban ${sid}`});
        } else if (type === 'role') {
            const roleArg = item.getAttribute('data-role');

            // --- CHANGED: Check isRacing to Queue ---
            if (isRacing && roleArg) {
                banQueue.push({type: 'role', sid, name: currentData.name, role: roleArg});
                updateQueueDisplay();
                showToast(`Queued Role: (${sid}) ${roleArg}`);
            } else {
                let cmd = `role ${sid}`;
                if (roleArg) cmd += `,${roleArg}`;
                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
                showToast(roleArg ? `Setting Role: ${sid} ${roleArg}` : `Checking Role Status`);
            }
        } else if (type === 'ban') {
            if (dur === "custom") {
                dur = prompt("Enter ban duration in minutes:");
                if (!dur || isNaN(dur)) return;
            }

            if (isRacing) {
                banQueue.push({sid, name: currentData.name, dur});
                updateQueueDisplay();

                if (currentData.online && currentData.connId) {
                    safeSendMessage({action: "PROXY_COMMAND", cmd: `kick ${currentData.connId}`});
                    showToast(`Queued Ban & Kicked: ${currentData.name}`);
                } else {
                    showToast(`Queued Ban: ${currentData.name} (Offline)`);
                }
            } else {
                const cmd = (dur === PERMA_DUR) ? `ban ${sid}` : `ban ${sid},${dur}`;
                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
                copyToClipboard(`${currentData.name} (${sid}) banned by Server for ${dur} minutes`);
                showToast(`Banned: ${currentData.name}`);
            }
        } else if (type === 'msg') {
            const msgText = item.getAttribute('data-text');

            let finalText = msgText.replace('{player}', currentData.name);

            const cmd = `message ${finalText}`;
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(`Message Sent`);
        } else if (type === 'restart') {
            const cmd = `restart`
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(`Server restarting....`);
        } else if (type === 'lookup') {
            safeSendMessage({action: "OPEN_TAB", url: `https://steamcommunity.com/profiles/${sid}`});
        } else if (type === 'users') {
            const cmd = `users`
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(`User listing`);
        } else if (type === 'chatlog') {
            openPlayerChat(sid, currentData.name);
        } else {
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
        const data = NAME_MAP[sid] || {name: "Offline Player", connId: null, online: false};

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
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="default">Default</div>
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

    const primeAudio = () => {
        if (!AudioContext || audioCtx) return;

        audioCtx = new AudioContext();

        // Resume is optional but safe
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        document.removeEventListener('pointerdown', primeAudio, true);
        document.removeEventListener('click', primeAudio, true);
    };

    // Capture phase helps extensions
    document.addEventListener('pointerdown', primeAudio, true);
    document.addEventListener('click', primeAudio, true);

    document.addEventListener('click', (e) => {
        if (actionMenu && !actionMenu.contains(e.target)) actionMenu.style.display = 'none';
    });
    document.addEventListener('mouseup', (e) => {
        if (e.ctrlKey && e.button === 0) {
            const line = e.target.closest('tr, div, p');
            if (!line) return;
            let text = (line.innerText || "").replace(/^\d{2}:\d{2}:\d{2}\.\d{3}:\s*/g, "").replace(/Command:\s*/i, "").trim();
            const idMatch = text.match(/\b\d{17}\b/);
            if (idMatch && NAME_MAP[idMatch[0]]) text = text.replace("??", NAME_MAP[idMatch[0]].name);
            copyToClipboard(text);
            line.style.backgroundColor = 'rgba(255,255,255,0.2)';
            setTimeout(() => {
                line.style.backgroundColor = '';
            }, 200);
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
                    updateRegex();
                    if (data.enabled !== false) scan(); // Apply new ones
                }

                // Handle Toolbar/UI updates
                if (changes.messages) {
                    updateToolbarMessages(MESSAGES);
                }
            });
        }
    });

    const bootstrapRaceStatusFromHistory = () => {
        const logRoot = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;
        const rawText = logRoot.innerText || logRoot.textContent || "";

        // Split by timestamp to analyze line by line chronologically
        const entries = rawText.split(/(?=\d{2}:\d{2}:\d{2}\.\d{3}:)/);

        let lastRaceEvent = null; // Track the most recent status found
        let lastTrackFound = "No Track Detected";

        entries.forEach(entry => {
            const line = entry.replace(/\u00a0/g, ' ').trim();
            const lowerLine = line.toLowerCase();

            // 1. Check for Race Status Events
            if (lowerLine.includes("race started")) {
                lastRaceEvent = "STARTED";
            } else if (lowerLine.includes("race finished") || lowerLine.includes("race abandoned")) {
                lastRaceEvent = "STOPPED";
            }

            // 2. Check for Track/Level Loading
            if (lowerLine.includes("loading level:")) {
                const match = line.match(/Loading\s+level:\s*([^(\n\r]+)/i);
                if (match && match[1]) {
                    lastTrackFound = match[1].trim();
                }
            }
        });

        // Apply the results of the scan
        if (lastRaceEvent === "STARTED") {
            isRacing = true;
            safeSendMessage({action: "SET_RACE_MODE", value: true});
            console.log("HH Bootstrap: Detected Race IN PROGRESS");
        } else {
            isRacing = false;
            safeSendMessage({action: "SET_RACE_MODE", value: false});
            console.log("HH Bootstrap: Detected No Active Race");
        }

        // Update the UI with the last track we found in history
        const trackEl = document.getElementById('hh-track-name');
        if (trackEl) trackEl.textContent = lastTrackFound;

        // Sync the visual UI state (the red/green bar)
        updateRaceUI(isRacing);
    };

    const isLogFrame = () => {
        return window.location.href.includes("StreamFile.aspx") ||
            window.location.href.includes("Proxy.ashx") ||
            !!document.querySelector('pre, .log-line, #ConsoleOutput');
    };

// Improved detection function
    const isUsersCommandOutputVisible = () => {
        const root = document.querySelector('pre, #ConsoleOutput, .log-container') || document.body;
        const text = root.innerText || "";
        // Check for the header. Using a regex to handle varying whitespace/hidden chars
        return /player-id,\s*name/i.test(text);
    };

    const init = async () => {
        if (isInitializing) return;
        isInitializing = true;

        try {
            const isLogFrame = window.location.href.includes("StreamFile.aspx") ||
                window.location.href.includes("Proxy.ashx") ||
                !!document.querySelector('pre, .log-line, #ConsoleOutput');

            const sync = await chrome.storage.sync.get(null);
            isEnabled = sync.enabled !== false;

            // ... (Rest of your settings/UI setup: KEYWORDS, createToolbar, etc.)
            KEYWORDS = sync.keywords || [];
            SECONDARYWORDS = sync.secondarykeywords || [];
            MESSAGES = sync.messages || [];
            isMuted = sync.muteAll !== false;
            applyStyles(sync);
            loadRegistry();
            createToolbar();
            updateQueueDisplay();
            updateRegex();

            if (!isLogFrame || !isEnabled) {
                isInitializing = false;
                return;
            }

            // 1. FAST POLLING for container
            let logRoot = document.querySelector('pre, #ConsoleOutput, .log-container');
            let attempts = 0;
            while (!logRoot && attempts < 40) {
                await new Promise(r => setTimeout(r, 50));
                logRoot = document.querySelector('pre, #ConsoleOutput, .log-container');
                attempts++;
            }
            if (!logRoot) logRoot = document.body;

            updateHeartbeat();
            // 2. INSTANT START: Observer and Initial Scan
            // This makes sure new lines and existing lines are highlighted immediately
            scan();
            if (window.hhObserver) window.hhObserver.disconnect();
            window.hhObserver = new MutationObserver((mutations) => {
                let shouldRescan = false;
                for (const mutation of mutations) {
                    if (mutation.target.closest('[id^="hh-"]') || mutation.target.classList?.contains('hh-highlight')) continue;
                    
                    for (const node of mutation.addedNodes) {
                        if (node.textContent) {
                            scanForKeywords(node.textContent);
                            processChatLog(node.textContent);
							if (node.textContent.toLowerCase().includes("kicked") || node.textContent.toLowerCase().includes("banned")) {
								processModLog(node.textContent);
							}
                            checkRaceStatus(node.textContent, false);
                            shouldRescan = true;
                        }
                    }
                }
                if (shouldRescan) {
                    clearTimeout(scanTimeout);
                    scanTimeout = setTimeout(scan, 50);
                }
            });
            window.hhObserver.observe(logRoot, {childList: true, subtree: true});

            // 3. INTELLIGENT BOOTSTRAP (The fix for the double >users)
            if (!didBootstrap) {

                // Wait until the log actually has content (history loading)
                let historyWait = 0;
                while (logRoot.innerText.length < 50 && historyWait < 20) {
                    await new Promise(r => setTimeout(r, 100)); // Wait up to 2 seconds for history
                    historyWait++;
                }

                buildChatHistoryFromDOM();
                bootstrapOnlineFromHistory();
                bootstrapRaceStatusFromHistory();
                updateRaceUI(isRacing);

                // Final check: Is the table there now?
                if (!isUsersCommandOutputVisible()) {
                    console.log("HH: No table found in history. Requesting 'users'...");
                    safeSendMessage({action: "PROXY_COMMAND", cmd: "users"});
                }
                didBootstrap = true;
            }

        } catch (e) {
            console.error("HH Init Error:", e);
        } finally {
            isInitializing = false;
        }
    };
    const startExtension = () => {
        if (!isLogFrame()) return;

        if (!document.body) {
            setTimeout(startExtension, 200);
            return;
        }
        init();
    };

    startExtension();

})();