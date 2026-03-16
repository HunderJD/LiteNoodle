// --- 1. CONSTANTS & HELPERS ---

const $ = selector => document.querySelector(selector);

const TIME_UNITS = { s: 1000, m: 60000, h: 3600000 };
const toMs = (value, unit) => value * (TIME_UNITS[unit] || 60000);

const formatDuration = (msTime) => {
  if (msTime <= 0) return "soon";
  const seconds = Math.floor(msTime / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const isInputValid = (val) => {
  const num = parseFloat(val);
  return !isNaN(num) && num > 0 && /^\d*\.?\d*$/.test(val);
};

const getDomain = (url) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return "";
  }
};

// --- 2. STATE MANAGEMENT ---

let saveVisualFeedbackTimeout;
let userIsTyping = false;

const getSettings = () => browser.storage.local.get([
  'timers', 'delay', 'unit', 'pin', 'discardNewTabs', 'isUpdating', 'whitelist', 'theme', 'resetAll'
]);

const saveSettings = async () => {
  const delayStr = $('#d').value;
  updateInputVisuals();
  
  const mainBtn = $('#a');
  clearTimeout(saveVisualFeedbackTimeout);
  
  if (!isInputValid(delayStr)) {
    showButtonFeedback(mainBtn, "✖ Invalid", "var(--danger)");
    return;
  }

  const state = await getSettings();
  const now = Date.now();
  const delayValue = parseFloat(delayStr);
  const unitValue = $('#u').value;
  const newLimitMs = toMs(delayValue, unitValue);
  const oldLimitMs = toMs(state.delay || 15, state.unit || 'm');
  const customTimers = state.timers || {};
  const resetAllPref = $('#resetAll').checked;

  // Update all active tab timers based on new limit
  const allTabs = await browser.tabs.query({});
  for (const tab of allTabs) {
    if (!tab.active && !tab.discarded) {
      let currentRemainingMs = customTimers[tab.id] ? (customTimers[tab.id] - now) : (oldLimitMs - (now - tab.lastAccessed));
      let finalRemainingMs = resetAllPref ? newLimitMs : Math.min(currentRemainingMs, newLimitMs);
      customTimers[tab.id] = now + Math.max(0, finalRemainingMs);
    }
  }

  await browser.storage.local.set({
    delay: delayValue, 
    unit: unitValue, 
    pin: $('#p').checked,
    discardNewTabs: $('#discardNewTabs').checked,
    resetAll: resetAllPref,
    timers: customTimers,
    isUpdating: false 
  });

  showButtonFeedback(mainBtn, "✓ Saved", "var(--accent)");
  setTimeout(populateTabsList, 500);
};

const showButtonFeedback = (btn, text, color) => {
  const originalText = "Discard Others";
  btn.innerText = text;
  btn.style.background = color;
  saveVisualFeedbackTimeout = setTimeout(() => {
    btn.innerText = originalText;
    btn.style.background = "";
  }, 1000);
};

// --- 3. UI RENDERING ---

const updateTheme = (isDark) => {
  document.body.classList.toggle('dark', isDark);
  $('#theme-toggle').checked = isDark;
  $('.brand-logo img').src = isDark ? 'icon-dark.svg' : 'icon-light.svg';
};

const updateInputVisuals = () => {
  const input = $('#d');
  let value = input.value;
  
  // Handle unit shortcuts (e.g. "10s")
  const shortcutMatch = value.match(/^(\d*\.?\d*)(s|m|h)$/i);
  if (shortcutMatch) {
    input.value = shortcutMatch[1];
    $('#u').value = shortcutMatch[2].toLowerCase();
    value = shortcutMatch[1];
  }

  input.style.width = `${Math.min((value.length || 1) + 1, 10)}ch`;
  input.classList.toggle('invalid', !isInputValid(value) && value !== "");
};

const refreshTimerLabels = async () => {
  if (userIsTyping) return;

  const state = await getSettings();
  const currentLimitMs = toMs(isInputValid($('#d').value) ? parseFloat($('#d').value) : 15, $('#u').value);
  const now = Date.now();
  const customTimers = state.timers || {};
  const whitelist = state.whitelist || [];

  let anyTabWasDiscarded = false;
  
  document.querySelectorAll('.timer').forEach(async (el) => {
    const tabId = parseInt(el.dataset.id);
    const domain = getDomain(el.dataset.url || "");

    if (whitelist.includes(domain)) {
      el.style.display = 'none';
      return;
    }

    if (el.dataset.discarded === "true") {
      el.innerText = '[soon]';
      el.style.display = '';
    } else if (el.dataset.active !== "true" && el.dataset.audible !== "true") {
      const lastAccessed = parseInt(el.dataset.lastAccessed);
      let remainingMs = customTimers[tabId] ? (customTimers[tabId] - now) : (currentLimitMs - (now - lastAccessed));

      if (remainingMs <= 0 && !state.isUpdating) {
        if (!state.pin || el.dataset.pinned === "true") {
          try {
            await browser.tabs.discard(tabId);
            if (customTimers[tabId]) {
              delete customTimers[tabId];
              await browser.storage.local.set({ timers: customTimers });
            }
            anyTabWasDiscarded = true;
          } catch(e) {}
        }
      }
      el.innerText = `[${formatDuration(remainingMs)}]`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
  
  if (anyTabWasDiscarded) populateTabsList();
};

const renderTab = (tab, container, isWhitelisted) => {
  const isReallyAudible = tab.audible && !tab.mutedInfo?.muted;
  const item = document.createElement('div');
  item.className = 'tab-item';
  
  const titleContainer = document.createElement('span');
  titleContainer.className = 'tab-title';
  
  const titleText = document.createElement('span');
  titleText.className = 'tab-text';
  // Truncate title if too long
  const displayTitle = tab.title.length > 40 ? tab.title.substring(0, 37) + '...' : tab.title;
  titleText.innerText = displayTitle;
  if (tab.active) titleText.style.fontWeight = '700';

  const timerLabel = document.createElement('span');
  timerLabel.className = 'timer';
  Object.assign(timerLabel.dataset, {
    id: tab.id,
    lastAccessed: tab.lastAccessed,
    active: tab.active,
    audible: isReallyAudible,
    discarded: false,
    pinned: tab.pinned,
    url: tab.url
  });

  if (isWhitelisted) {
    const checkMark = document.createElement('span');
    checkMark.innerText = '✓ ';
    checkMark.style.cssText = 'color: var(--accent); font-size: 10px; margin-right: 4px;';
    checkMark.title = 'Whitelisted';
    titleContainer.append(checkMark);
  }

  titleContainer.append(titleText, timerLabel);
  
  if (isReallyAudible) {
    const soundIcon = document.createElement('span');
    soundIcon.innerText = ' (Sound)';
    soundIcon.style.cssText = 'font-size: 8px; margin-left: 4px;';
    titleContainer.append(soundIcon);
  }

  item.append(titleContainer);

  if (!tab.active && !isReallyAudible && !isWhitelisted) {
    const discardBtn = document.createElement('button');
    discardBtn.className = 'status-btn';
    discardBtn.innerText = 'OFF';
    discardBtn.onclick = () => browser.tabs.discard(tab.id).then(populateTabsList);
    item.append(discardBtn);
  } else {
    const indicator = document.createElement('div');
    indicator.style.cssText = 'min-width: 45px; font-size: 8px; text-align: center; font-weight: 800;';
    if (tab.active) {
      indicator.innerText = 'ACTIVE';
      indicator.style.opacity = '0.5';
    } else if (isWhitelisted) {
      indicator.innerText = 'SAFE';
      indicator.style.color = 'var(--accent)';
    }
    item.append(indicator);
  }
  container.appendChild(item);
};

const populateTabsList = async () => {
  const state = await getSettings();
  const allTabs = await browser.tabs.query({});
  const whitelist = state.whitelist || [];
  
  const activeTabsUI = $('#list');
  activeTabsUI.innerHTML = '';

  // 1. Filter & Sort Tabs
  const relevantTabs = allTabs.filter(tab => {
    const url = tab.url || "";
    const isSystem = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlank = ['about:newtab', 'about:blank', 'about:home', ''].includes(url);
    if (isSystem && (!isBlank || !state.discardNewTabs)) return false;
    return state.pin || !tab.pinned;
  });

  const activeTabsCount = relevantTabs.filter(t => !t.discarded).length;
  $('#s').innerText = `${activeTabsCount} / ${relevantTabs.length}`;

  // 2. Render Tabs
  relevantTabs.filter(t => !t.discarded).forEach(tab => {
    const isWhitelisted = whitelist.includes(getDomain(tab.url));
    renderTab(tab, activeTabsUI, isWhitelisted);
  });

  updateWhitelistButton();
  refreshTimerLabels();
};

const updateWhitelistButton = async () => {
  const btn = $('#whitelist-current-btn');
  const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const currentTab = tabs[0];
  
  if (!currentTab || !currentTab.url || currentTab.url.startsWith('about:') || currentTab.url.startsWith('chrome:')) {
    btn.style.display = 'none';
    return;
  }
  
  btn.style.display = 'block';
  const domain = getDomain(currentTab.url);
  const state = await browser.storage.local.get('whitelist');
  const whitelist = state.whitelist || [];
  const isWhitelisted = whitelist.includes(domain);
  
  if (isWhitelisted) {
    btn.classList.add('whitelisted');
    btn.innerText = `${domain} is whitelisted`;
  } else {
    btn.classList.remove('whitelisted');
    btn.innerText = `Whitelist ${domain}`;
  }
};

// --- 4. ACTION FUNCTIONS ---

const toggleWhitelist = async () => {
  const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const currentTab = tabs[0];
  if (!currentTab) return;
  
  const domain = getDomain(currentTab.url);
  if (!domain) return;
  
  const state = await browser.storage.local.get('whitelist');
  const whitelist = state.whitelist || [];
  const index = whitelist.indexOf(domain);
  
  if (index > -1) {
    whitelist.splice(index, 1);
  } else {
    whitelist.push(domain);
  }
  
  await browser.storage.local.set({ whitelist });
  populateTabsList();
};

const addToWhitelist = async (domain) => {
  if (!domain) return;
  const state = await browser.storage.local.get('whitelist');
  const whitelist = state.whitelist || [];
  if (!whitelist.includes(domain)) {
    whitelist.push(domain);
    await browser.storage.local.set({ whitelist });
    populateTabsList();
  }
};

const removeFromWhitelist = async (domain) => {
  const state = await browser.storage.local.get('whitelist');
  const whitelist = state.whitelist || [];
  const index = whitelist.indexOf(domain);
  if (index > -1) {
    whitelist.splice(index, 1);
    await browser.storage.local.set({ whitelist });
    populateTabsList();
  }
};

// --- 5. EVENT LISTENERS ---

// React to tab switching and updates while popup is open
browser.tabs.onActivated.addListener(populateTabsList);
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title) {
    populateTabsList();
  }
});

$('#theme-toggle').onchange = (e) => {
  const isDark = e.target.checked;
  updateTheme(isDark);
  browser.storage.local.set({ theme: isDark ? 'dark' : 'light' });
};

['#u','#p','#discardNewTabs','#resetAll'].forEach(sel => $(sel).onchange = () => {
  browser.storage.local.set({ isUpdating: true }).then(saveSettings);
});

const delayInput = $('#d');
delayInput.onfocus = () => { userIsTyping = true; browser.storage.local.set({ isUpdating: true }); };
delayInput.onblur = () => { userIsTyping = false; saveSettings(); };
delayInput.oninput = () => { userIsTyping = true; browser.storage.local.set({ isUpdating: true }); updateInputVisuals(); };

$('#a').onclick = async () => {
  const state = await getSettings();
  const whitelist = state.whitelist || [];
  const targets = await browser.tabs.query({ active: false, audible: false, discarded: false });
  
  targets.forEach(tab => {
    const domain = getDomain(tab.url);
    if (!tab.url.startsWith('about:') && !whitelist.includes(domain) && (state.pin || !tab.pinned)) {
      browser.tabs.discard(tab.id).catch(() => {});
    }
  });
  setTimeout(populateTabsList, 300);
};

$('#whitelist-current-btn').onclick = toggleWhitelist;

// --- 6. INITIALIZATION ---

window.addEventListener('unload', () => browser.storage.local.set({ isUpdating: false }));

getSettings().then(state => {
  $('#d').value = state.delay || 15;
  $('#u').value = state.unit || 'm';
  $('#p').checked = !!state.pin;
  $('#discardNewTabs').checked = !!state.discardNewTabs;
  $('#resetAll').checked = state.resetAll !== undefined ? !!state.resetAll : true;
  
  updateInputVisuals();
  updateTheme(state.theme === 'dark' || (!state.theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
  populateTabsList();
});

setInterval(refreshTimerLabels, 1000);
