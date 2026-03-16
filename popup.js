// --- HELPER FUNCTIONS ---

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

// --- STATE MANAGEMENT ---

let saveVisualFeedbackTimeout;
let userIsTyping = false;

// --- CORE FUNCTIONS ---

const updateTheme = (isDark) => {
  document.body.classList.toggle('dark', isDark);
  $('#theme-toggle').checked = isDark;
  $('.brand-logo img').src = isDark ? 'icon-dark.svg' : 'icon-light.svg';
};

const refreshTimerLabels = async () => {
  if (userIsTyping) return;

  const state = await browser.storage.local.get(['timers', 'delay', 'unit', 'pin', 'discardNewTabs', 'isUpdating', 'whitelist']);
  const inputValue = $('#d').value;
  const unitValue = $('#u').value;
  const pinPref = $('#p').checked;
  const whitelist = state.whitelist || [];

  const currentLimitMs = toMs(isInputValid(inputValue) ? parseFloat(inputValue) : 15, unitValue);
  const now = Date.now();
  const customTimers = state.timers || {};

  let anyTabWasDiscarded = false;
  const timerElements = document.querySelectorAll('.timer');
  
  for (const el of timerElements) {
    const tabId = parseInt(el.dataset.id);
    const lastAccessed = parseInt(el.dataset.lastAccessed);
    const isActive = el.dataset.active === "true";
    const isAudible = el.dataset.audible === "true";
    const isDiscarded = el.dataset.discarded === "true";
    const isPinned = el.dataset.pinned === "true";
    const url = el.dataset.url || "";
    const domain = getDomain(url);

    let labelText = "";
    
    // Skip whitelisted domains
    if (whitelist.includes(domain)) {
      el.innerText = "";
      el.style.display = 'none';
      continue;
    }

    if (isDiscarded) {
      labelText = '[soon]';
    } else if (!isNaN(lastAccessed) && !isActive && !isAudible) {
      let remainingMs;
      
      if (customTimers[tabId]) {
        remainingMs = customTimers[tabId] - now;
      } else {
        remainingMs = currentLimitMs - (now - lastAccessed);
      }

      if (remainingMs <= 0 && !state.isUpdating) {
        if (!isPinned || pinPref) {
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
      labelText = `[${formatDuration(remainingMs)}]`;
    }

    el.innerText = labelText;
    el.style.display = labelText ? '' : 'none';
  }
  
  if (anyTabWasDiscarded) populateTabsList();
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

const populateTabsList = async () => {
  const state = await browser.storage.local.get();
  const allowPinned = $('#p').checked;
  const discardNewTabs = $('#discardNewTabs').checked;
  const whitelist = state.whitelist || [];
  const allTabs = await browser.tabs.query({});
  
  const whitelistContainer = $('#whitelist-list');
  const whitelistedTabsList = $('#whitelisted-tabs-list');
  const otherTabsList = $('#list');
  const whitelistedHeader = $('#whitelisted-tabs-header');

  whitelistContainer.innerHTML = ''; 
  whitelistedTabsList.innerHTML = '';
  otherTabsList.innerHTML = '';

  // Render Whitelist Domains
  if (whitelist.length === 0) {
    whitelistContainer.innerHTML = '<div style="font-size: 10px; opacity: 0.5; padding: 4px;">No domains whitelisted</div>';
  } else {
    whitelist.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'whitelist-item';
      item.innerHTML = `
        <span>${domain}</span>
        <span class="remove-whitelist" title="Remove from whitelist">×</span>
      `;
      item.querySelector('.remove-whitelist').onclick = () => removeFromWhitelist(domain);
      whitelistContainer.appendChild(item);
    });
  }
  
  const relevantTabs = allTabs.filter(tab => {
    const url = tab.url || "";
    const isSystem = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlank = ['about:newtab', 'about:blank', 'about:home', ''].includes(url);
    
    if (isSystem && (!isBlank || !discardNewTabs)) return false;
    
    return !(!allowPinned && tab.pinned);
  });

  const activeTabsCount = relevantTabs.filter(t => !t.discarded).length;
  $('#s').innerText = `${activeTabsCount} / ${relevantTabs.length}`;

  const whitelistedTabs = [];
  const otherTabs = [];

  relevantTabs.filter(t => !t.discarded).forEach(tab => {
    const domain = getDomain(tab.url);
    if (whitelist.includes(domain)) {
      whitelistedTabs.push(tab);
    } else {
      otherTabs.push(tab);
    }
  });

  if (whitelistedTabs.length === 0) {
    whitelistedHeader.style.display = 'none';
    whitelistedTabsList.style.display = 'none';
  } else {
    whitelistedHeader.style.display = '';
    whitelistedTabsList.style.display = '';
  }

  const renderTab = (tab, container, isWhitelisted) => {
    const domain = getDomain(tab.url);
    const isReallyAudible = tab.audible && !tab.mutedInfo?.muted;
    const item = document.createElement('div');
    item.className = 'tab-item';
    
    const titleContainer = document.createElement('span');
    titleContainer.className = 'tab-title';
    
    const titleText = document.createElement('span');
    titleText.className = 'tab-text';
    titleText.innerText = tab.title;
    if (tab.active) titleText.style.fontWeight = '700';

    const timerLabel = document.createElement('span');
    timerLabel.className = 'timer';
    timerLabel.dataset.id = tab.id;
    timerLabel.dataset.lastAccessed = tab.lastAccessed;
    timerLabel.dataset.active = tab.active;
    timerLabel.dataset.audible = isReallyAudible;
    timerLabel.dataset.discarded = false;
    timerLabel.dataset.pinned = tab.pinned;
    timerLabel.dataset.url = tab.url;

    if (isWhitelisted) {
      const checkMark = document.createElement('span');
      checkMark.innerText = '✓ ';
      checkMark.style.color = 'var(--accent)';
      checkMark.style.fontSize = '10px';
      checkMark.style.marginRight = '4px';
      checkMark.title = 'Whitelisted';
      titleContainer.append(checkMark);
    }

    titleContainer.append(titleText, timerLabel);
    
    if (isReallyAudible) {
      const soundIcon = document.createElement('span');
      soundIcon.innerText = ' (Sound)';
      soundIcon.style.fontSize = '8px';
      soundIcon.style.marginLeft = '4px';
      titleContainer.append(soundIcon);
    }

    item.append(titleContainer);

    if (!tab.active && !isReallyAudible && !isWhitelisted) {
      const discardBtn = document.createElement('button');
      discardBtn.className = 'status-btn';
      discardBtn.innerText = 'OFF';
      discardBtn.onclick = () => browser.tabs.discard(tab.id).then(populateTabsList).catch(() => {});
      item.append(discardBtn);
    } else {
      const activeIndicator = document.createElement('div');
      activeIndicator.style.minWidth = '45px';
      if (tab.active) {
        activeIndicator.innerText = 'ACTIVE';
        activeIndicator.style.fontSize = '8px';
        activeIndicator.style.textAlign = 'center';
        activeIndicator.style.opacity = '0.5';
        activeIndicator.style.fontWeight = '800';
      } else if (isWhitelisted) {
        activeIndicator.innerText = 'SAFE';
        activeIndicator.style.fontSize = '8px';
        activeIndicator.style.textAlign = 'center';
        activeIndicator.style.color = 'var(--accent)';
        activeIndicator.style.fontWeight = '800';
      }
      item.append(activeIndicator);
    }
    container.appendChild(item);
  };

  whitelistedTabs.forEach(tab => renderTab(tab, whitelistedTabsList, true));
  otherTabs.forEach(tab => renderTab(tab, otherTabsList, false));
  
  refreshTimerLabels();
};

const handleInputVisualsAndShortcuts = () => {
  const input = $('#d');
  let value = input.value;
  
  const shortcutMatch = value.match(/^(\d*\.?\d*)(s|m|h)$/i);
  if (shortcutMatch) {
    input.value = shortcutMatch[1];
    $('#u').value = shortcutMatch[2].toLowerCase();
    value = shortcutMatch[1];
  }

  const charCount = value.length || 1;
  input.style.width = `${Math.min(charCount + 1, 10)}ch`;
  input.classList.toggle('invalid', !isInputValid(value) && value !== "");
};

const saveSettings = async () => {
  const delayStr = $('#d').value;
  handleInputVisualsAndShortcuts();
  const mainBtn = $('#a');
  
  clearTimeout(saveVisualFeedbackTimeout);
  
  if (!isInputValid(delayStr)) {
    mainBtn.innerText = "✖ Invalid";
    mainBtn.style.background = "var(--danger)";
    saveVisualFeedbackTimeout = setTimeout(() => {
      mainBtn.innerText = "Discard Others";
      mainBtn.style.background = "";
    }, 1000);
    return;
  }

  const now = Date.now();
  const delayValue = parseFloat(delayStr);
  const unitValue = $('#u').value;
  const pinPref = $('#p').checked;
  const discardNewTabsPref = $('#discardNewTabs').checked;
  const resetAllPref = $('#resetAll').checked;
  const newLimitMs = toMs(delayValue, unitValue);
  
  const allTabs = await browser.tabs.query({});
  const state = await browser.storage.local.get(['timers', 'delay', 'unit']);
  
  const oldLimitMs = toMs(state.delay || 15, state.unit || 'm');
  const customTimers = state.timers || {};

  for (const tab of allTabs) {
    if (!tab.active && !tab.discarded) {
      let currentRemainingMs;
      if (customTimers[tab.id]) {
        currentRemainingMs = customTimers[tab.id] - now;
      } else {
        currentRemainingMs = oldLimitMs - (now - tab.lastAccessed);
      }

      let finalRemainingMs;
      if (resetAllPref) {
        finalRemainingMs = newLimitMs;
      } else {
        // Logique demandée : si on réduit le temps, on reset au nouveau max. 
        // Si on l'augmente, on garde le temps restant actuel (qui est forcément < au nouveau max).
        finalRemainingMs = Math.min(currentRemainingMs, newLimitMs);
      }

      customTimers[tab.id] = now + Math.max(0, finalRemainingMs);
    }
  }

  await browser.storage.local.set({
    delay: delayValue, 
    unit: unitValue, 
    pin: pinPref,
    discardNewTabs: discardNewTabsPref,
    resetAll: resetAllPref,
    timers: customTimers,
    isUpdating: false 
  });

  mainBtn.innerText = "✓ Saved";
  mainBtn.style.background = "var(--accent)";
  saveVisualFeedbackTimeout = setTimeout(() => {
    mainBtn.innerText = "Discard Others";
    mainBtn.style.background = "";
    populateTabsList();
  }, 500);
};

// --- EVENT LISTENERS ---

$('#theme-toggle').onchange = (e) => {
  const isDark = e.target.checked;
  updateTheme(isDark);
  browser.storage.local.set({ theme: isDark ? 'dark' : 'light' });
};

['#u','#p','#discardNewTabs','#resetAll'].forEach(selector => $(selector).onchange = () => {
  browser.storage.local.set({ isUpdating: true }).then(saveSettings);
});

const delayInput = $('#d');

delayInput.onfocus = () => { 
  userIsTyping = true; 
  browser.storage.local.set({ isUpdating: true }); 
};

delayInput.onblur = () => { 
  userIsTyping = false; 
  saveSettings(); 
};

delayInput.oninput = () => {
  userIsTyping = true;
  browser.storage.local.set({ isUpdating: true });
  handleInputVisualsAndShortcuts();
};

$('#a').onclick = async () => {
  const settings = await browser.storage.local.get();
  const whitelist = settings.whitelist || [];
  const targets = await browser.tabs.query({ active: false, audible: false, discarded: false });
  
  targets.forEach(tab => {
    const isSystem = tab.url.startsWith('about:');
    const domain = getDomain(tab.url);
    if (!isSystem && !whitelist.includes(domain) && (settings.pin || !tab.pinned)) {
      browser.tabs.discard(tab.id).catch(() => {});
    }
  });
  setTimeout(populateTabsList, 300);
};

$('#whitelist-current-btn').onclick = async () => {
  const btn = $('#whitelist-current-btn');
  try {
    // Get the current active tab in the window that was focused before the popup
    const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]) {
      const domain = getDomain(tabs[0].url);
      if (domain) {
        await addToWhitelist(domain);
        
        // Visual feedback
        const oldText = btn.innerText;
        btn.innerText = `✓ Added ${domain}`;
        btn.style.borderColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
        
        setTimeout(() => {
          btn.innerText = oldText;
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 1500);
      }
    }
  } catch (err) {
    console.error("Error adding to whitelist:", err);
    btn.innerText = "✖ Error";
    setTimeout(() => { btn.innerText = "ADD current tab to whitelist"; }, 1500);
  }
};

// --- INITIALIZATION ---

window.addEventListener('unload', () => {
  browser.storage.local.set({ isUpdating: false });
});

browser.storage.local.get().then(state => {
  $('#d').value = state.delay || 15;
  $('#u').value = state.unit || 'm';
  $('#p').checked = !!state.pin;
  $('#discardNewTabs').checked = !!state.discardNewTabs;
  $('#resetAll').checked = state.resetAll !== undefined ? !!state.resetAll : true;
  
  handleInputVisualsAndShortcuts();
  
  if (state.theme) {
    updateTheme(state.theme === 'dark');
  } else {
    updateTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  
  populateTabsList();
});

setInterval(refreshTimerLabels, 1000);
