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
	let matrixInterval = null;
	let matrixCanvas = null;	

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    const getKeywordText = k => typeof k === 'string' ? k : k.text;


	const SERVER_COMMANDS = [
		{ cmd: "countdown", aliases: "", desc: "Set starting lobby countdown (seconds).", params: true },
		{ cmd: "users", aliases: "clients", desc: "List all human clients.", params: false },
		{ cmd: "kick", aliases: "", desc: "Kick a player (requires player-id).", params: true },
		{ cmd: "ban", aliases: "", desc: "Ban a player (user-id, duration).", params: true },
		{ cmd: "unban", aliases: "pardon", desc: "Unban a player (user-id).", params: true },
		{ cmd: "laps", aliases: "", desc: "Change or print the number of laps.", params: true },
		{ cmd: "grid_size", aliases: "", desc: "Set max participants (grid size).", params: true },
		{ cmd: "race_end", aliases: "abandon", desc: "End race without processing results.", params: false },
		{ cmd: "restart_countdown", aliases: "", desc: "Restart the lobby countdown timer.", params: false },
		
		
		// { cmd: "banlist", aliases: "", desc: "Print the current ban list.", params: false },
		// { cmd: "idle_kick", aliases: "", desc: "Print or set idle kick timer.", params: true },
		// { cmd: "name", aliases: "", desc: "Print or set the server name.", params: true },
		// { cmd: "description", aliases: "", desc: "Print or set server description.", params: true },
		{ cmd: "role", aliases: "", desc: "Get or set user role (user-id, role).", params: true },
		{ cmd: "race_director", aliases: "", desc: "Print/set auto-assigned director role.", params: true },
		{ cmd: "password", aliases: "", desc: "Set/check password (use 'disabled' to open).", params: true },
		{ cmd: "status", aliases: "", desc: "Print current game server status.", params: false },
		// { cmd: "version", aliases: "", desc: "Print game version.", params: false },
		// { cmd: "print_config", aliases: "", desc: "Print current server configuration.", params: false },
		{ cmd: "restart", aliases: "", desc: "Restart the server immediately.", params: false },
		{ cmd: "shutdown", aliases: "", desc: "Request a graceful server shutdown.", params: false },
		{ cmd: "exit", aliases: "quit", desc: "Exit the server application.", params: false },
		
		{ cmd: "players", aliases: "plrs", desc: "List all connected players.", params: false },
		{ cmd: "bot", aliases: "add_bot", desc: "Add AI players (optional count).", params: true },
		{ cmd: "bots", aliases: "bot_count", desc: "Print or set total number of bots.", params: true },

		
		// { cmd: "level", aliases: "track", desc: "Print or set the current track.", params: true },
		// { cmd: "levels", aliases: "tracks", desc: "List all available environments and levels.", params: false },
		// { cmd: "weather", aliases: "", desc: "Print or set the current weather.", params: true },
		// { cmd: "weathers", aliases: "", desc: "List weathers for the current level.", params: false },
		{ cmd: "damage", aliases: "", desc: "Change damage settings or list types.", params: true },
		{ cmd: "rules", aliases: "", desc: "List current event rules.", params: false },
		{ cmd: "event", aliases: "", desc: "Print current event settings.", params: false },

		{ cmd: "roles", aliases: "", desc: "List all available roles and admins.", params: false },

		// --- Utilities ---
		{ cmd: "countdown", aliases: "", desc: "Set starting lobby countdown (seconds).", params: true },
		// { cmd: "race_end_timer", aliases: "", desc: "Print or set the race end timer.", params: true },
		// { cmd: "telemetry_player", aliases: "", desc: "Set player ID for rich data packets.", params: true },
		// { cmd: "show_join_errors", aliases: "", desc: "Toggle console visibility for join errors.", params: true },
		{ cmd: "cup", aliases: "", desc: "Manage cup settings.", params: true },
		{ cmd: "eventloop", aliases: "el", desc: "Manage event loop settings.", params: true },
		// { cmd: "help", aliases: "commands, ?", desc: "List all available commands.", params: false }
	];

	let helpPage = 0;
	const HELP_PER_PAGE = 8;	

	const openHelpWindow = () => {
		const view = document.getElementById('hh-help-view') || createHelpView();
		renderHelpLines();
		view.style.display = 'flex';
	};

	function createHelpView() {
		const el = document.createElement('div');
		el.id = 'hh-help-view';
		el.className = 'hh-chat-view'; // Reuses your modal base styles
		el.innerHTML = `
			<div class="hh-panel-header">
				<span class="hh-panel-title">${chrome.i18n.getMessage("server_commands")}</span>
				<span id="hh-help-close" style="cursor:pointer;color:#ff4444;font-weight:bold;font-size:18px;">✖</span>
			</div>
			<div class="hh-chat-filter-row">
				<input type="text" id="hh-help-search" class="hh-chat-search" placeholder="${chrome.i18n.getMessage("search_placeholder")}" style="flex-grow:1;">
			</div>
			<div class="hh-chat-content" id="hh-help-content"></div>
			<div class="hh-chat-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 10px;">
				<div id="hh-help-pagination" style="display: flex; align-items: center; gap: 5px;">
					<button id="hh-help-prev" class="hh-tool-btn info" style="margin: 0;">◀</button>
					<span id="hh-help-page-num" style="color: #ccc; min-width: 20px; text-align: center;">1</span>
					<button id="hh-help-next" class="hh-tool-btn info" style="margin: 0;">▶</button>
				</div>
				<span style="font-size: 10px; color: #666; font-style: italic;">${chrome.i18n.getMessage("message_run")}</span>
			</div>
		`;
		getUIWrapper().appendChild(el);

		el.querySelector('#hh-help-search').oninput = () => { helpPage = 0; renderHelpLines(); };
		el.querySelector('#hh-help-prev').onclick = () => { if(helpPage > 0) { helpPage--; renderHelpLines(); }};
		el.querySelector('#hh-help-next').onclick = () => { helpPage++; renderHelpLines(); };
		el.querySelector('#hh-help-close').onclick = () => el.style.display = 'none';

		return el;
	}	

	function renderHelpLines() {
		const container = document.getElementById('hh-help-content');
		const search = document.getElementById('hh-help-search').value.toLowerCase();
		
		const filtered = SERVER_COMMANDS.filter(c => 
			c.cmd.includes(search) || c.aliases.includes(search) || c.desc.toLowerCase().includes(search)
		);

		const start = helpPage * HELP_PER_PAGE;
		const paginated = filtered.slice(start, start + HELP_PER_PAGE);

		container.innerHTML = '';
		paginated.forEach(c => {
			const line = document.createElement('div');
			line.className = 'hh-mod-line'; // Reuses styling for rows
			line.style.cursor = 'pointer';
			line.innerHTML = `
				<div style="flex-grow:1">
					<strong style="color: var(--hh-accent)">${c.cmd}</strong> 
					<span style="color: #888; font-size: 11px;">${c.aliases ? '('+c.aliases+')' : ''}</span>
					<div style="font-size: 12px; color: #bbb;">${c.desc}</div>
				</div>
				<button class="hh-tool-btn info" style="padding: 2px 8px;">${chrome.i18n.getMessage("btn_run")}</button>
			`;
			line.onclick = () => {
				const input = c.params ? prompt(chrome.i18n.getMessage("prompt_params",[c.cmd])) : "";
				if(input) {
					safeSendMessage({ action: "PROXY_COMMAND", cmd: `${c.cmd} ${input}`, autoSubmit: true });
				} else {
					safeSendMessage({ action: "PROXY_COMMAND", cmd: `${c.cmd}`, autoSubmit: true });
				}
				showToast(`Sent: ~${c.cmd}`);
			};
			container.appendChild(line);
		});

		document.getElementById('hh-help-page-num').innerText = `${helpPage + 1}`;
		document.getElementById('hh-help-next').disabled = (start + HELP_PER_PAGE) >= filtered.length;
	}

	const showPlayerContextMenu = (e, player) => {
		if (!actionMenu) {
			actionMenu = document.createElement('div');
			actionMenu.className = 'hh-action-menu';
			document.body.appendChild(actionMenu);
			
			document.addEventListener('click', (e) => {
				 if (actionMenu && !actionMenu.contains(e.target)) {
					 actionMenu.style.display = 'none';
				 }
			});
		}

		const playerMessages = MESSAGES.filter(m => m.text.includes('{player}'));

		let menuHtml = '';
		if (playerMessages.length > 0) {
			menuHtml = playerMessages.map((m, idx) => {
				const displayText = m.label || m.text.replace('{player}', player.name);
				return `<div class="hh-menu-row player-action-item" data-index="${idx}">${displayText}</div>`;
			}).join('');
		} else {
			menuHtml = `<div class="hh-menu-row disabled">${chrome.i18n.getMessage("submenu_no_messages")}</div>`;
		}

		menuHtml += `<div class="hh-menu-row" id="ctx-btn-close" style="border-top: 1px solid #444; color: #ff4444;">${chrome.i18n.getMessage("menu_close")}</div>`;
		
		actionMenu.innerHTML = menuHtml;

		actionMenu.style.left = `${e.pageX}px`;
		actionMenu.style.top = `${e.pageY}px`;
		actionMenu.style.display = 'flex';
		actionMenu.style.zIndex = '2147483647';

		actionMenu.querySelectorAll('.player-action-item').forEach(item => {
			item.onclick = () => {
				const index = item.getAttribute('data-index');
				const template = playerMessages[index].text;
				
				const finalMsg = template.replace(/{player}/g, player.name);

				safeSendMessage({
					action: "PROXY_COMMAND", 
					cmd: `message ${finalMsg}`, 
					autoSubmit: true
				});

				showToast(chrome.i18n.getMessage("toast_sent", [player.name]));
				actionMenu.style.display = 'none';
			};
		});

		const closeBtn = document.getElementById('ctx-btn-close');
		if (closeBtn) {
			closeBtn.onclick = () => {
				actionMenu.style.display = 'none';
			};
		}
	};

	const translateText = async (text, targetLang = 'en') => {
		try {
			const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
			const data = await response.json();
			return data[0].map(x => x[0]).join('');
		} catch (e) {
			return "Translation error.";
		}
	};

	const showTranslationMenu = (e, message, translationDiv) => {
		if (!actionMenu) {
			actionMenu = document.createElement('div');
			actionMenu.className = 'hh-action-menu';
			document.body.appendChild(actionMenu);
			
			// Add the click listener to close it when clicking elsewhere
			document.addEventListener('click', (e) => {
				 if (actionMenu && !actionMenu.contains(e.target)) {
					 actionMenu.style.display = 'none';
				 }
			});
		}

		actionMenu.innerHTML = `
			<div class="hh-menu-row" id="ctx-btn-translate">${chrome.i18n.getMessage("menu_translate")}</div>
			<div class="hh-menu-row" id="ctx-btn-copy">${chrome.i18n.getMessage("menu_copy")}</div>
			<div class="hh-menu-row" id="ctx-btn-close">${chrome.i18n.getMessage("menu_close")}</div>
		`;

		actionMenu.style.display = 'flex'; 
		actionMenu.style.visibility = 'visible';
		actionMenu.style.zIndex = '2147483647'; 


		const menuWidth = actionMenu.offsetWidth || 150;
		const menuHeight = actionMenu.offsetHeight || 100;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let posX = e.pageX;
		let posY = e.pageY;

		if (e.clientX + menuWidth > viewportWidth) {
			posX = e.pageX - menuWidth;
		}

		if (e.clientY + menuHeight > viewportHeight) {
			posY = e.pageY - menuHeight;
		}

		actionMenu.style.left = `${posX}px`;
		actionMenu.style.top = `${posY}px`;

		const btnTranslate = document.getElementById('ctx-btn-translate');
		const btnClose = document.getElementById('ctx-btn-close');
		const btnCopy = document.getElementById('ctx-btn-copy');

		if (btnTranslate) {
			btnTranslate.onclick = async () => {
				translationDiv.innerText = "Translating...";
				translationDiv.style.display = 'block';
				
				const result = await translateText(message);
				translationDiv.innerText = `[EN]: ${result}`;

				if (translationDiv.id === 'hh-console-translation-tip') {
					setTimeout(() => { 
						translationDiv.style.display = 'none'; 
					}, 12000);
				}

				actionMenu.style.display = 'none';
			};
		}
		
		if( btnCopy) {
			btnCopy.onclick = async () => {
				copyToClipboard(message);
				actionMenu.style.display = 'none';
			};
		}

		if (btnClose) {
			btnClose.onclick = () => {
				actionMenu.style.display = 'none';
			};
		}
	};

	function buildChatLine(m) {
		const line = document.createElement('div');
		line.className = 'hh-mod-line'; 
		line.style.flexDirection = 'column';
		line.style.alignItems = 'flex-start';

		line.innerHTML = `
			<div class="hh-chat-row-main">
				<span class="hh-mod-ts">[${m.timestamp}]</span> 
				<strong>${m.name}</strong>: <span class="hh-message-body">${m.message}</span>
			</div>
			<div class="hh-chat-translation" style="display:none; color:#00ff88; font-size:11px; padding-left:15px; font-style:italic; white-space: normal;"></div>
		`;

		line.oncontextmenu = (e) => {
			if (!isEnabled) return;
			
			e.preventDefault();
			e.stopPropagation();
			const transDiv = line.querySelector('.hh-chat-translation');
			showTranslationMenu(e, m.message, transDiv);
		};

		return line;
	}

	const openModLog = () => {
		const view = document.getElementById('hh-mod-log-view') || createModView();
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
					<span class="hh-panel-title">${chrome.i18n.getMessage("mod_panel_title")}</span>
				</div>
				<span id="hh-mod-close" style="cursor:pointer;color:#ff4444;font-weight:bold;font-size:18px;">✖</span>
			</div>
			
			<div class="hh-chat-filter-row">
				<select id="hh-mod-filter-type" class="hh-chat-player-select" style="margin:0; width:100px;">
					<option value="all">${chrome.i18n.getMessage("mod_filter_all")}</option>
					<option value="KICKED">${chrome.i18n.getMessage("mod_filter_kick")}</option>
					<option value="BANNED">${chrome.i18n.getMessage("mod_filter_ban")}</option>
				</select>
				
				<input type="text" id="hh-mod-search" class="hh-chat-search" placeholder="${chrome.i18n.getMessage("mod_search_placeholder")}" style="margin:0; flex-grow:1;">
				
				<div style="display:flex; align-items:center; gap:5px;">
					<span style="font-size:10px; color:#888;">${chrome.i18n.getMessage("mod_label_from")}</span>
					<input type="text" id="hh-mod-time-start" class="hh-chat-time-input" placeholder="${chrome.i18n.getMessage("time_player_holder")}">
					<span style="font-size:10px; color:#888;">${chrome.i18n.getMessage("mod_label_to")}</span>
					<input type="text" id="hh-mod-time-end" class="hh-chat-time-input" placeholder="${chrome.i18n.getMessage("time_player_holder2")}">
				</div>
			</div>

			<div class="hh-chat-content" id="hh-mod-content"></div>
			<div class="hh-chat-footer">
				<span id="hh-mod-stats" style="font-size:10px; color:#666;">${chrome.i18n.getMessage("mod_0_actions")}</span>
				<div style="display:flex; gap:5px;">
					<button id="hh-export-mod" class="hh-tool-btn info">${chrome.i18n.getMessage("mod_btn_export")}</button>
					<button id="hh-copy-mod" class="hh-tool-btn info">${chrome.i18n.getMessage("mod_btn_copy")}</button>
				</div>
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
		
		// Copy Visible Mod Log
		el.querySelector('#hh-copy-mod').onclick = () => {
			const text = getVisibleModText();
			navigator.clipboard.writeText(text);
			showToast(chrome.i18n.getMessage("toast_mod_copied"));
		};

		// Export Mod Log
		el.querySelector('#hh-export-mod').onclick = () => {
			const text = getVisibleModText();
			const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			downloadTextFile(text, `mod-log-${ts}.txt`);
		};

		el.querySelector('#hh-mod-close').onclick = () => el.style.display = 'none';
		return el;
	}

	const getVisibleModText = () => {
		const typeFilter = document.getElementById('hh-mod-filter-type').value;
		const searchText = document.getElementById('hh-mod-search').value.toLowerCase();
		const startTime = document.getElementById('hh-mod-time-start').value;
		const endTime = document.getElementById('hh-mod-time-end').value;

		return modHistory.filter(m => {
			if (typeFilter !== 'all' && m.action !== typeFilter) return false;
			if (searchText && !m.targetName.toLowerCase().includes(searchText) && !m.targetId.includes(searchText)) return false;
			if (startTime && m.timestamp < startTime) return false;
			if (endTime && m.timestamp > endTime) return false;
			return true;
		})
		.map(m => `${chrome.i18n.getMessage("mod_entry_format", [m.timestamp, m.action, m.targetName, m.targetId, m.adminName])}${m.duration ? chrome.i18n.getMessage("mod_entry_duration",[m.duration.toString()]) : ''}`)
		.join('\n');
	};

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

		document.getElementById('hh-mod-stats').innerText = `${chrome.i18n.getMessage("mod_stats", [filtered.length.toString(), modHistory.length.toString()])}`;
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
        if (!chrome.runtime?.id) {
            return; 
        }
        // ---------------------------------------

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
            dot.title = chrome.i18n.getMessage("status_active");
        } else {
            dot.style.background = "#ffcc00"; // Yellow
            dot.style.boxShadow = "0 0 5px #ffcc00";
            dot.title = chrome.i18n.getMessage("status_standby");
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
            name: name || existing.name || chrome.i18n.getMessage("name_unknown"),
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
		
		if (!chrome.runtime?.id) { return; }

        const count = getOnlineCount();
        const countText = chrome.i18n.getMessage("player_count", [count]);

        if (active) {
            el.innerHTML = `${chrome.i18n.getMessage("race_active")}${countText}`;
            el.style.background = 'rgba(255, 0, 0, 0.2)';
            el.style.color = '#ff4d4d';
            el.style.border = '1px solid #ff4d4d';
        } else {
            el.innerHTML = `${chrome.i18n.getMessage("race_none")}${countText}`;
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
            {label: chrome.i18n.getMessage("tool_sid_label"), type: 'info', icon: '🛠️', id: 'hh-sid-trigger', desc: chrome.i18n.getMessage("tool_sid_desc")},
            {label: chrome.i18n.getMessage("tool_chat_label"), type: 'info', icon: '💬', action: 'openChat', desc: chrome.i18n.getMessage("tool_chat_desc")},
			{label: chrome.i18n.getMessage("tool_mod_label"), type: 'info', icon: '🛡️', action: 'openModLog', desc: chrome.i18n.getMessage("tool_mod_desc")},
            {label: chrome.i18n.getMessage("tool_msg_label"), type: 'info', icon: '💬', id: 'hh-msg-trigger', desc: chrome.i18n.getMessage("tool_msg_desc")},
            {label: chrome.i18n.getMessage("tool_players_label"), type: 'info', icon: '📋', action: 'togglePlayers', desc: chrome.i18n.getMessage("tool_players_desc")},
            {label: chrome.i18n.getMessage("tool_commands_label"), type: 'info', icon: '🖥️', id: 'hh-cmd-trigger', desc: chrome.i18n.getMessage("tool_commands_desc")},
			{label: chrome.i18n.getMessage("tool_restart_label"), type: 'danger', icon: '🔄', cmd: 'restart', desc: chrome.i18n.getMessage("tool_restart_desc")}
        ];

        tools.forEach(tool => {
            const btn = document.createElement('div');
            btn.className = `hh-tool-btn ${tool.type}`;
            btn.innerHTML = `<span>${tool.icon}</span> ${tool.label}`;
            btn.title = tool.desc;

			if (tool.id) btn.id = tool.id;

            btn.onclick = (e) => {
                if (tool.id === 'hh-sid-trigger') {
                    e.stopPropagation();
                    const menu = document.getElementById('hh-toolbar-sid-submenu');
                    // Close other menus
                    document.getElementById('hh-toolbar-msg-submenu').style.display = 'none';
                    document.getElementById('hh-toolbar-cmd-submenu').style.display = 'none';
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                } else if (tool.id === 'hh-cmd-trigger') {
					e.stopPropagation();
                    const menu = document.getElementById('hh-toolbar-cmd-submenu');
                    // Close other menus
                    document.getElementById('hh-toolbar-msg-submenu').style.display = 'none';
                    document.getElementById('hh-toolbar-sid-submenu').style.display = 'none';
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block'					
                } else if (tool.id === 'hh-msg-trigger') {
                    e.stopPropagation();
                    const menu = document.getElementById('hh-toolbar-msg-submenu');
                    // Close other menus
                    document.getElementById('hh-toolbar-sid-submenu').style.display = 'none';
                    document.getElementById('hh-toolbar-cmd-submenu').style.display = 'none';
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                } else if (tool.action === 'togglePlayers') {
                    togglePlayerList();
                } else if (tool.cmd === 'restart') {
                    if (!restartClickTimer) {
                        // First click
                        restartClickTimer = setTimeout(() => {
                            restartClickTimer = null;
                            showToast(chrome.i18n.getMessage("toast_restart_confirm"));
                        }, 500); // Window for the second click
                    } else {
                        // Second click within 500ms
                        clearTimeout(restartClickTimer);
                        restartClickTimer = null;
                        safeSendMessage({action: "PROXY_COMMAND", cmd: "restart"});
                        showToast(chrome.i18n.getMessage("toast_restarting"));
                    }
                } else if (tool.action === 'openChat') {
                    openChatSelector();
                } else if (tool.action === 'perma') {
                    sid = prompt(chrome.i18n.getMessage("prompt_steam_id_to_ban"));
                    if (!sid || isNaN(sid)) return;
                    dur = PERMA_DUR;
                    // Chances are not online as will be a perma of an id from a different server
                    if (isRacing) {
                        banQueue.push({sid, dur});
                        updateQueueDisplay();
                        showToast(chrome.i18n.getMessage("toast_queued_ban",[sid]));
                    } else {
                        const cmd = `ban ${sid}`;
                        safeSendMessage({
                            action: "PROXY_COMMAND",
                            cmd: cmd,
                            autoSubmit: true
                        });
                        showToast(chrome.i18n.getMessage("toast_banned",[sid]));
                    }
                } else if (tool.action === 'openModLog') {
					const view = document.getElementById('hh-mod-view') || createModView();
					renderModLines();
					view.style.display = 'flex';
				} else {
                    // Standard commands (users, etc.)
                    safeSendMessage({action: "PROXY_COMMAND", cmd: tool.cmd});
                    showToast(chrome.i18n.getMessage("toast_sent", [tool.label]));
                }
            };
            toolbar.appendChild(btn);

        });

        const infoGroup = document.createElement('div');
        infoGroup.className = 'hh-info-group';
        infoGroup.innerHTML = `
    <div id="hh-race-status" class="hh-status-tag" title="${chrome.i18n.getMessage("race_title")}">${chrome.i18n.getMessage("race_none")}</div>
    <div id="hh-track-name" class="hh-track-display" title="${chrome.i18n.getMessage("race_track_title")}">${chrome.i18n.getMessage("waiting_for_track")}</div>
  `;

        updateRaceUI(isRacing);
        toolbar.appendChild(infoGroup);

		const msgSubmenu = document.createElement('div');
        msgSubmenu.id = 'hh-toolbar-msg-submenu';
        msgSubmenu.className = 'hh-action-menu';
        msgSubmenu.style.display = 'none';
        
        msgSubmenu.style.top = '100%';
        msgSubmenu.style.left = '0';
        msgSubmenu.style.marginTop = '5px'; 
        msgSubmenu.style.minWidth = '150px';

		const msgBtn = toolbar.querySelector('#hh-msg-trigger');
        if (msgBtn) {
            msgBtn.style.position = 'relative'; // Make button the anchor
            msgBtn.appendChild(msgSubmenu);
        } else {
            toolbar.appendChild(msgSubmenu); // Fallback
        }

        const cmdSubmenu = document.createElement('div');
		cmdSubmenu.id = 'hh-toolbar-cmd-submenu';
        cmdSubmenu.className = 'hh-action-menu';
		Object.assign(cmdSubmenu.style, {
			display: 'none',
			top: '100%',
			left: '0',
			marginTop: '5px',
			minWidth: '150px',
		});

		const cmdBtn = toolbar.querySelector('#hh-cmd-trigger');
        if (cmdBtn) {
            cmdBtn.style.position = 'relative'; // Make button the anchor
            cmdBtn.appendChild(cmdSubmenu);
        } else {
            toolbar.appendChild(cmdSubmenu); // Fallback
        }

        const cmdActions = [
            {label: chrome.i18n.getMessage("tool_users_label"), type: 'users', icon: '👥', cmd: 'users', desc: chrome.i18n.getMessage("tool_users_desc")},
            {label: chrome.i18n.getMessage("tool_list_label"), type: 'list', icon: '🗒️', cmd: 'el list', desc: chrome.i18n.getMessage("tool_list_desc")},
            {label: chrome.i18n.getMessage("tool_select_label"), type: 'select', icon: '✅', cmd: 'el select', desc: chrome.i18n.getMessage("tool_select_desc")},
	        {label: chrome.i18n.getMessage("tool_help_label"), type: 'info', icon: '❓', action: 'openHelp', desc: chrome.i18n.getMessage("tool_help_desc")},

			{label: '', type: 'matrix', icon: '🕶️', desc: chrome.i18n.getMessage("tool_spluts_desc")}
        ];
				
	    cmdActions.forEach(act => {
            const item = document.createElement('div');
            item.className = 'hh-menu-item';
            item.innerHTML = `<span>${act.icon}</span> ${act.label}`;
			item.title = act.desc;
            item.onclick = (e) => {
                e.stopPropagation();
				if(act.type === 'select') {
					const num = prompt(`${chrome.i18n.getMessage("prompt_num")}`);
					if (!num || isNaN(num)) return;
					const finalCmd = `${act.cmd} ${num}`;
					safeSendMessage({action: "PROXY_COMMAND", cmd: finalCmd, autoSubmit: true});
				} else if (act.action === 'openHelp') {
					openHelpWindow();
				} else if (act.type === 'matrix') {
					enterTheMatrix();
				} else {
					safeSendMessage({action: "PROXY_COMMAND", cmd: act.cmd, autoSubmit: true});
				}
                   
                cmdSubmenu.style.display = 'none';
            };
            cmdSubmenu.appendChild(item);
        });
		
        const sidSubmenu = document.createElement('div');
        sidSubmenu.id = 'hh-toolbar-sid-submenu';
        sidSubmenu.className = 'hh-action-menu';
        sidSubmenu.style.display = 'none';
        sidSubmenu.style.top = '100%';
        sidSubmenu.style.bottom = 'auto';

        const sidActions = [
            {label: chrome.i18n.getMessage("submenu_permanent_ban"), type: 'ban', dur: PERMA_DUR},
            {label: chrome.i18n.getMessage("submenu_set_default"), type: 'role', role: 'default'},
            {label: chrome.i18n.getMessage("submenu_set_vip"), type: 'role', role: 'vip'},
            {label: chrome.i18n.getMessage("submenu_set_moderator"), type: 'role', role: 'moderator'},
            {label: chrome.i18n.getMessage("submenu_set_admin"), type: 'role', role: 'admin'}
        ];

        sidActions.forEach(act => {
            const item = document.createElement('div');
            item.className = 'hh-menu-item';
            item.textContent = act.label;
            item.onclick = (e) => {
                e.stopPropagation();
                const sid = prompt(`${chrome.i18n.getMessage("prompt_steam_id",[act.label])}`);
                if (!sid || isNaN(sid) || sid.length !== 17) return;

                if (isRacing) {
                    outmsg = ``;
                    if (act.type === 'role') {
                        banQueue.push({type: 'role', sid, name: chrome.i18n.getMessage("queue_manual_entry"), role: act.role});
                        outmsg = chrome.i18n.getMessage("toast_queued_role",[sid,act.role]);
                    } else {
                        banQueue.push({type: 'ban', sid, name: chrome.i18n.getMessage("queue_manual_entry"), dur: act.dur});
                        outmsg = chrome.i18n.getMessage("toast_queued_banned",[sid]);
                    }
                    updateQueueDisplay();
                    showToast(outmsg);
                } else {
                    let cmd = act.type === 'role' ? `role ${sid}${act.role ? ',' + act.role : ''}` : `ban ${sid}`;
                    safeSendMessage({action: "PROXY_COMMAND", cmd: cmd, autoSubmit: true});
                    showToast(chrome.i18n.getMessage("toast_sent", [act.label]));

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
            cmdSubmenu.style.display = 'none';
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
        filter.placeholder = chrome.i18n.getMessage("filter_users");
        filter.className = 'hh-chat-player-filter';

        const rebuildOptions = () => {
            const term = filter.value.toLowerCase().trim();
            select.innerHTML = '';

            // Add ALL Option
            const allOpt = document.createElement('option');
            allOpt.value = "ALL";
            allOpt.textContent = chrome.i18n.getMessage("all_players_option");
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
                title.innerText = `${chrome.i18n.getMessage("chat_history_title")}`;
            } else {
                const data = NAME_MAP[select.value];
                if (data) title.innerText = `${chrome.i18n.getMessage("chat_username", [data.name])}`;
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
      <span>${chrome.i18n.getMessage("online_players")}</span>
      <input type="text" id="hh-player-search" placeholder="${chrome.i18n.getMessage("search_placeholder")}">
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
            <div class="hh-player-info" title="${chrome.i18n.getMessage("player_list_copy_title")}">
              <span class="hh-player-name">${data.name}</span>
              <span class="hh-player-id">${id}</span>
            </div>
            <div class="hh-player-actions">
              <button class="hh-btn-profile" title="${chrome.i18n.getMessage("player_list_profile_title")}">P</button>
              <button class="hh-btn-kick" 	 title="${chrome.i18n.getMessage("player_list_kick_title")}">K</button>
              <button class="hh-btn-ban" 	 title="${chrome.i18n.getMessage("player_list_ban_title")}">B</button>
            </div>
          `;

                        // Copy ID logic
                        row.querySelector('.hh-player-info').onclick = () => {
                            navigator.clipboard.writeText(id);
                            showToast(chrome.i18n.getMessage("toast_copied_id",[id]));
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
							if (isRacing) {
								banQueue.push({id, name: data.name, dur: PERMA_DUR});
								updateQueueDisplay();

								if (data.online && data.connId) {
									safeSendMessage({action: "PROXY_COMMAND", cmd: `kick ${data.connId}`, autoSubmit: true });
									showToast(chrome.i18n.getMessage("toast_queued_banned_kicked",[data.name]));
								} else {
									showToast(chrome.i18n.getMessage("toast_queued_ban",[data.name]));
								}
							}
							else {
								safeSendMessage({action: "PROXY_COMMAND", cmd: `ban ${id}`});
								showToast(chrome.i18n.getMessage("toast_banned",[data.name]));
							}
                        };

						row.oncontextmenu = (e) => {
							if (!isEnabled) return;
							
							e.preventDefault();
							e.stopPropagation();
							showPlayerContextMenu(e, { name: data.name, id: id });
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
        title.innerText = `${chrome.i18n.getMessage("chat_username", [name])}`;
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
                <span class="hh-panel-title">${chrome.i18n.getMessage("chat_history")}</span>
            </div>
            <div style="display:flex; align-items:center;">
                <input type="text" class="hh-chat-search" placeholder="${chrome.i18n.getMessage("search_keywords_placeholder")}">
                <span id="hh-chat-close" style="cursor:pointer;color:#ff4444;font-weight:bold;">✖</span>
            </div>
        </div>
        
        <div class="hh-chat-filter-row">
            <input type="text" id="hh-chat-start" class="hh-chat-time-input" placeholder="${chrome.i18n.getMessage("time_start_placeholder")}">
            <input type="text" id="hh-chat-end" class="hh-chat-time-input" placeholder="${chrome.i18n.getMessage("time_end_placeholder")}">
            
            <label class="hh-chat-checkbox-label" title="${chrome.i18n.getMessage("search_hide_title")}">
                <input type="checkbox" id="hh-hide-server" checked> 
                ${chrome.i18n.getMessage("search_hide_server")}
            </label>
        </div>
        
        <div class="hh-chat-content"></div>
        <div class="hh-chat-footer">
            <button id="hh-export-chat" class="hh-tool-btn info">${chrome.i18n.getMessage("popup_btn_export")}</button>
            <button id="hh-copy-chat" class="hh-tool-btn info">${chrome.i18n.getMessage("mod_btn_copy")}</button>
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
            showToast(chrome.i18n.getMessage("toast_mod_copied"));
        };

        // Export
        el.querySelector('#hh-export-chat').onclick = () => {
            const text = getVisibleChatText();
            if (!text) {
				showToast(chrome.i18n.getMessage("toast_mod_no_content"));
                return;
            }

            const sid = window.currentViewedId || "ALL";
			const name = (NAME_MAP[sid]?.name || chrome.i18n.getMessage("global_chat")).replace(/[^\w\d_-]+/g, '_');
            const ts = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
            const filename = `chat_${name}_${ts}.txt`;

            downloadTextFile(text, filename);
            showToast(chrome.i18n.getMessage("toast_exported",[filename]));
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
            container.innerHTML = `<div class="hh-menu-item disabled">${chrome.i18n.getMessage("messages_global_empty")}</div>`;
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

                showToast(chrome.i18n.getMessage("toast_signal",[msg.label]));
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
        <div id="hh-queue-header"><span>${chrome.i18n.getMessage("queue_title")}</span><span id="hh-queue-count">0</span></div>
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
                    extraLabel = `<span style="margin-left:8px; color:#00ffff; font-weight:bold;">[Role: ${item.role || chrome.i18n.getMessage("queue_role_check")}]</span>`;
                } else {
                    const d = (item.dur === PERMA_DUR) ? "Perma" : `${item.dur}m`;
                    extraLabel = `<span style="margin-left:8px; color:#ffbc00; font-weight:bold;">[${chrome.i18n.getMessage("menu_ban_prefix")} ${d}]</span>`;
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
                if (isSilent) showToast(chrome.i18n.getMessage("toast_queued_bans"));
                updateRaceUI(true);
            }
        } else if (/race\s+finished/i.test(text) || /race\s+abandoned/i.test(text)) {
            if (isRacing) {
                isRacing = false;
                safeSendMessage({action: "SET_RACE_MODE", value: false});
                if (isSilent) showToast(chrome.i18n.getMessage("toast_bans_not_queued"));
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
		if (!isEnabled) return;
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
        if (!isEnabled) return;
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
		queuedBansMsgs = [];

        banQueue.forEach((item, index) => {
            setTimeout(() => {
                let cmd;
                if (item.type === 'role') {
                    cmd = `role ${item.sid}`;
                    if (item.role) cmd += `,${item.role}`;
                    combinedLogs.push(`${item.name} (${item.sid}) role set to ${item.role || 'Check'} by Server`);
                } else {
                    // Default to Ban
                    cmd = (item.dur === PERMA_DUR) ? `ban ${item.sid}` : `ban ${item.sid},${item.dur}`;
					const msg = `${item.name} (${item.sid}) banned by Server for ${item.dur} minutes`
                    combinedLogs.push(msg);
					queuedBansMsgs.push(msg);
                }

                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd, autoSubmit: true});

                if (index === banQueue.length - 1) {
                    setTimeout(() => {
                        safeSendMessage({action: "SET_QUEUE_MODE", value: false});
                    }, 1000);
                }
            }, index * 2000);
        });

        copyToClipboard(queuedBansMsgs.join("\n"));
        showToast( chrome.i18n.getMessage("toast_processing",[banQueue.length]));
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
                        name: logMatch[3].trim() || existing.name || chrome.i18n.getMessage("name_unknown"),
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
                showToast(chrome.i18n.getMessage("toast_queued_role",[sid, roleArg]));
            } else {
                let cmd = `role ${sid}`;
                if (roleArg) cmd += `,${roleArg}`;
                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
                showToast(roleArg ? chrome.i18n.getMessage("toast_setting_role",[sid,roleArg]) : chrome.i18n.getMessage("toast_checking_role"));
            }
        } else if (type === 'ban') {
            if (dur === "custom") {
                dur = prompt(chrome.i18n.getMessage("prompt_duration"));
                if (!dur || isNaN(dur)) return;
            }

            if (isRacing) {
                banQueue.push({sid, name: currentData.name, dur});
                updateQueueDisplay();

                if (currentData.online && currentData.connId) {
                    safeSendMessage({action: "PROXY_COMMAND", cmd: `kick ${currentData.connId}`});
                    showToast(chrome.i18n.getMessage("toast_queued_banned_kicked",[currentData.name]));
                } else {
                    showToast(chrome.i18n.getMessage("toast_queued_ban",[currentData.name]));
                }
            } else {
                const cmd = (dur === PERMA_DUR) ? `ban ${sid}` : `ban ${sid},${dur}`;
                safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
                copyToClipboard(`${currentData.name} (${sid}) banned by Server for ${dur} minutes`);
                showToast(chrome.i18n.getMessage("toast_banned"));
            }
        } else if (type === 'msg') {
            const msgText = item.getAttribute('data-text');

            let finalText = msgText.replace('{player}', currentData.name);

            const cmd = `message ${finalText}`;
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(chrome.i18n.getMessage("toast_message_sent"));
        } else if (type === 'restart') {
            const cmd = `restart`
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(chrome.i18n.getMessage("toast_restarting"));
        } else if (type === 'lookup') {
            safeSendMessage({action: "OPEN_TAB", url: `https://steamcommunity.com/profiles/${sid}`});
        } else if (type === 'users') {
            const cmd = `users`
            safeSendMessage({action: "PROXY_COMMAND", cmd: cmd});
            showToast(chrome.i18n.getMessage("submenu_user_listing"));
        } else if (type === 'chatlog') {
            openPlayerChat(sid, currentData.name);
        } else {
            copyToClipboard(sid);
        }
        actionMenu.style.display = 'none';
    };

    document.addEventListener('contextmenu', (e) => {
		if (!isEnabled) return;

        const target = e.target.closest('.hh-idhighlight');
        if (!target) return;
        e.preventDefault();

        if (!actionMenu) {
            actionMenu = document.createElement('div');
            actionMenu.className = 'hh-action-menu';
            document.body.appendChild(actionMenu);
        }

        const sid = target.textContent.trim();
        const data = NAME_MAP[sid] || {name: chrome.i18n.getMessage("offline_player"), connId: null, online: false};

        actionMenu.innerHTML = `
      <div class="hh-menu-header">
        <div class="hh-header-left"><span class="hh-status-dot ${data.online ? 'hh-status-online' : 'hh-status-offline'}"></span><span>${data.name}</span></div>
        <span id="hh-close-x">✕</span>
      </div>
	<div class="hh-menu-row ${!data.online ? 'disabled' : ''}" data-type="kick" data-sid="${sid}" data-conn="${data.connId || ''}">${chrome.i18n.getMessage("menu_kick")}</div>
      <div class="hh-menu-row" data-type="parent" id="hh-ban-row">${chrome.i18n.getMessage("menu_ban")}
        <div class="hh-submenu" id="hh-ban-submenu">
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="${PERMA_DUR}" >${chrome.i18n.getMessage("submenu_permanent_ban")}</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="2880" >${chrome.i18n.getMessage("submenu_ban_2880")}</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="5000" >${chrome.i18n.getMessage("submenu_ban_5000")}</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="10000" >${chrome.i18n.getMessage("submenu_ban_10000")}</div>
          <div class="hh-submenu-item" data-type="ban" data-sid="${sid}" data-dur="custom" >${chrome.i18n.getMessage("submenu_ban_custom")}</div>
        </div>
      </div>
      <div class="hh-menu-row" data-type="unban" data-sid="${sid}">${chrome.i18n.getMessage("menu_unban")}</div>
      <div class="hh-menu-row" data-type="parent" id="hh-role-row">${chrome.i18n.getMessage("menu_role")}
         <div class="hh-submenu" id="hh-role-submenu">
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="">${chrome.i18n.getMessage("submenu_check_status")}</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="default">${chrome.i18n.getMessage("submenu_set_default")}</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="vip">${chrome.i18n.getMessage("submenu_set_vip")}</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="moderator">${chrome.i18n.getMessage("submenu_set_moderator")}</div>
             <div class="hh-submenu-item" data-type="role" data-sid="${sid}" data-role="admin">${chrome.i18n.getMessage("submenu_set_admin")}</div>
         </div>
      </div>
      <div class="hh-menu-row" data-type="parent" id="hh-message-row">${chrome.i18n.getMessage("submenu_message")}
        <div class="hh-submenu" id="hh-message-submenu">
			${MESSAGES.filter(m => m.text.includes('{player}')).length > 0
            ? MESSAGES.filter(m => m.text.includes('{player}')).map(m => {
                const safeText = m.text.replace(/"/g, '&quot;');
                return `<div class="hh-submenu-item" data-type="msg" data-sid="${sid}" data-text="${safeText}">${m.label}</div>`;
            }).join('')
            : `<div class="hh-submenu-item disabled">${chrome.i18n.getMessage("submenu_no_messages")}</div>`
        }
        </div>
      </div>
	  <div class="hh-menu-row" data-type="lookup" data-sid="${sid}">${chrome.i18n.getMessage("menu_profile")}</div>
      <div class="hh-menu-row" data-type="copy" data-sid="${sid}">${chrome.i18n.getMessage("menu_copy_id")}</div>
      <div class="hh-menu-row" data-type="chatlog" data-sid="${sid}">${chrome.i18n.getMessage("menu_chat_logs")}</div>`;

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

// Global right-click listener for the Console Window
document.addEventListener('contextmenu', (e) => {
	if (!isEnabled) return;

	if (e.target.closest('#hh-ui-wrapper, .hh-action-menu, .hh-chat-view, .hh-mod-view, .hh-toast')) return;

    if (e.target.closest('.hh-idhighlight')) return;

    if (e.target.closest('.hh-mod-line')) return;

    const isLogContext = window.location.href.includes("StreamFile.aspx") ||
                         window.location.href.includes("Proxy.ashx") ||
                         e.target.closest('pre, #ConsoleOutput, #consoleOutput, .log-container') ||
                         document.body; // Fallback: If we are running, the body is likely the log.
    if (isLogContext) {
		e.preventDefault();
        e.stopPropagation();
		
		const selectedText = window.getSelection().toString().trim();
        const textToTranslate = selectedText || e.target.innerText;

        if (textToTranslate && textToTranslate.length > 1) {
            let tip = document.getElementById('hh-console-translation-tip');
            if (!tip) {
                tip = document.createElement('div');
                tip.id = 'hh-console-translation-tip';
				tip.style.cssText = `
                    position: absolute; 
                    color: #00ff88; 
                    background: rgba(10, 10, 10, 0.95); 
                    padding: 10px; 
                    border-radius: 6px; 
                    font-size: 13px; 
                    z-index: 2147483647; 
                    display: none; 
                    border: 1px solid #00ff88; 
                    max-width: 450px; 
                    min-width: 150px;
                    max-height: 300px;
                    overflow-y: auto;
                    white-space: pre-wrap; 
                    word-wrap: break-word;
                    font-style: italic; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.8);
                    pointer-events: auto;
                `;
                document.body.appendChild(tip);
            }
            const scrollY = window.scrollY;
            const viewportHeight = window.innerHeight;
            
            let topPos = e.pageY + 15;
            let leftPos = e.pageX + 5;

            if (e.clientY + 200 > viewportHeight) { 
                topPos = e.pageY - 150; // Offset upwards
            }

            if (e.clientX + 450 > window.innerWidth) {
                leftPos = e.pageX - 400;
            }

            tip.style.left = `${leftPos}px`;
            tip.style.top = `${topPos}px`;
            showTranslationMenu(e, textToTranslate, tip);
        }
    }
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
        let lastTrackFound = chrome.i18n.getMessage("race_track_none");

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

            if (!isLogFrame || !isEnabled) {
                isInitializing = false;
                return;
            }

            applyStyles(sync);
            loadRegistry();
            createToolbar();
            updateQueueDisplay();
            updateRegex();

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



/**
 * Matrix Easter Egg for HH Monitor
 * Call enterTheMatrix() in the console to trigger
 */
const enterTheMatrix = () => {
	if (matrixInterval || matrixCanvas) {
        clearInterval(matrixInterval);
        matrixInterval = null;
        
        if (matrixCanvas) {
            matrixCanvas.remove();
            matrixCanvas = null;
        }
        
		showToast(chrome.i18n.getMessage("toast_matrix_exit"));
        return; // Stop execution here
    }
	
	matrixCanvas = document.createElement('canvas');
    matrixCanvas.id = 'hh-matrix-canvas';
    Object.assign(matrixCanvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        zIndex: '2147483000', 
        background: '#000'
    });
    document.body.appendChild(matrixCanvas);

    const ctx = matrixCanvas.getContext('2d');
    let width = matrixCanvas.width = window.innerWidth;
    let height = matrixCanvas.height = window.innerHeight;

    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=%\"'#&_(),.;:?!\\|{}<>[]^~";
    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    const drops = new Array(columns).fill(1);

    const draw = () => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#0F0";
        ctx.font = fontSize + "px monospace";

        for (let i = 0; i < drops.length; i++) {
            const text = characters.charAt(Math.floor(Math.random() * characters.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    };

    matrixInterval = setInterval(draw, 33);
	
	matrixCanvas.onclick = () => {
        clearInterval(matrixInterval);		
        matrixInterval = null;
        if (matrixCanvas) {
            matrixCanvas.remove();
            matrixCanvas = null;
        }
		showToast(chrome.i18n.getMessage("toast_matrix_exit"));
    };
    showToast(chrome.i18n.getMessage("toast_matrix_welcome"));
};


// Expose it to the window so you can call it from the browser console
window.enterTheMatrix = enterTheMatrix;

})();