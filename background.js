const TIME_UNITS = {
  s: 1000,
  m: 60000,
  h: 3600000
};

const convertToMs = (value, unit) => value * (TIME_UNITS[unit] || TIME_UNITS.m);

let nextCheckTimeout = null;

const checkInactiveTabs = async () => {
  // Clear any pending scheduled check
  if (nextCheckTimeout) clearTimeout(nextCheckTimeout);

  const settings = await browser.storage.local.get(['delay', 'unit', 'pin', 'timers', 'isUpdating']);
  
  // If user is editing, we wait
  if (settings.isUpdating) return;

  const delayLimit = settings.delay || 15;
  const unit = settings.unit || 'm';
  const allowPinned = settings.pin || false;
  const discardNewTabs = settings.discardNewTabs || false;
  const customTimers = settings.timers || {};
  
  const globalThresholdMs = convertToMs(delayLimit, unit);
  const now = Date.now();
  
  const tabs = await browser.tabs.query({ active: false, discarded: false, audible: false });
  
  let timersUpdated = false;
  let soonestCheckMs = Infinity;

  for (const tab of tabs) {
    const url = tab.url || "";
    const isSystemPage = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlankPage = ['about:newtab', 'about:blank', 'about:home', ''].includes(url);

    const isEligible = (!isSystemPage || (discardNewTabs && isBlankPage)) && (allowPinned || !tab.pinned);

    if (isEligible) {
      let remainingMs;
      if (customTimers[tab.id]) {
        remainingMs = customTimers[tab.id] - now;
      } else {
        remainingMs = globalThresholdMs - (now - tab.lastAccessed);
      }

      if (remainingMs <= 0) {
        try {
          await browser.tabs.discard(tab.id);
          if (customTimers[tab.id]) {
            delete customTimers[tab.id];
            timersUpdated = true;
          }
        } catch (e) {}
      } else {
        // Track the smallest remaining time to schedule the next check
        if (remainingMs < soonestCheckMs) {
          soonestCheckMs = remainingMs;
        }
      }
    }
  }

  if (timersUpdated) {
    await browser.storage.local.set({ timers: customTimers });
  }

  // Schedule the next check if there's a tab that will expire soon
  // This bypasses the 1-minute alarm limit for short durations
  if (soonestCheckMs !== Infinity) {
    // Add a small buffer (500ms) to ensure the time has actually passed
    nextCheckTimeout = setTimeout(checkInactiveTabs, soonestCheckMs + 500);
  }
};

// Listeners for reactivity
browser.tabs.onActivated.addListener(checkInactiveTabs);
browser.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'complete') checkInactiveTabs();
});

// Periodic fallback (minimum 1 minute)
browser.alarms.create("checkTabsAlarm", { periodInMinutes: 1 });
browser.alarms.onAlarm.addListener(checkInactiveTabs);

// Storage listener: if settings change, re-check immediately
browser.storage.onChanged.addListener((changes) => {
  if (changes.delay || changes.unit || changes.timers || changes.isUpdating) {
    checkInactiveTabs();
  }
});

// Initial run
checkInactiveTabs();

// Install logic
browser.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    browser.tabs.create({ url: "install.html" });
  }
});
