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

  const state = await browser.storage.local.get(['timers', 'delay', 'unit', 'pin', 'isUpdating']);
  const inputValue = $('#d').value;
  const unitValue = $('#u').value;
  const pinPref = $('#p').checked;

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

    let labelText = "";
    
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

const populateTabsList = async () => {
  const state = await browser.storage.local.get();
  const allowPinned = $('#p').checked;
  const allTabs = await browser.tabs.query({});
  const listContainer = $('#list');
  
  listContainer.innerHTML = ''; 
  
  const relevantTabs = allTabs.filter(tab => {
    const url = tab.url || "";
    const isSystem = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlank = ['about:newtab', 'about:blank', 'about:home', ''].includes(url);
    if (isSystem && !isBlank) return false;
    return !(!allowPinned && tab.pinned);
  });

  const activeTabsCount = relevantTabs.filter(t => !t.discarded).length;
  $('#s').innerText = `${activeTabsCount} / ${relevantTabs.length}`;

  relevantTabs.filter(t => !t.discarded).forEach(tab => {
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

    titleContainer.append(titleText, timerLabel);
    
    if (isReallyAudible) {
      const soundIcon = document.createElement('span');
      soundIcon.innerText = ' (Sound)';
      soundIcon.style.fontSize = '8px';
      soundIcon.style.marginLeft = '4px';
      titleContainer.append(soundIcon);
    }

    item.append(titleContainer);

    if (!tab.active && !isReallyAudible) {
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
      }
      item.append(activeIndicator);
    }
    listContainer.appendChild(item);
  });
  
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

['#u','#p','#resetAll'].forEach(selector => $(selector).onchange = () => {
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
  const targets = await browser.tabs.query({ active: false, audible: false, discarded: false });
  
  targets.forEach(tab => {
    const isSystem = tab.url.startsWith('about:');
    if (!isSystem && (settings.pin || !tab.pinned)) {
      browser.tabs.discard(tab.id);
    }
  });
  setTimeout(populateTabsList, 300);
};

// --- INITIALIZATION ---

browser.storage.local.get().then(state => {
  $('#d').value = state.delay || 15;
  $('#u').value = state.unit || 'm';
  $('#p').checked = !!state.pin;
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
