
const TIME_UNITS = {
  s: 1000,       // Second
  m: 60 * 1000,  // Minute
  h: 3600 * 1000 // Hour
};


const convertToMs = (value, unit) => value * (TIME_UNITS[unit] || TIME_UNITS.m);


const checkInactiveTabs = async () => {
  const settings = await browser.storage.local.get(['delay', 'unit', 'pin', 'timers', 'isUpdating']);
  
  // SECURITY: Do nothing if the user is currently editing settings in the popup
  if (settings.isUpdating) return;

  const delayLimit = settings.delay || 15;
  const unit = settings.unit || 'm';
  const allowPinned = settings.pin || false;
  const customTimers = settings.timers || {};
  
  const globalThresholdMs = convertToMs(delayLimit, unit);
  const now = Date.now();
  
  // We only target background tabs that are not audible and not already discarded
  const tabs = await browser.tabs.query({ active: false, discarded: false, audible: false });
  
  for (const tab of tabs) {
    const url = tab.url || "";
    const isSystemPage = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlankPage = url === 'about:newtab' || url === 'about:blank' || url === 'about:home' || url === '';
    
    // System pages cannot be discarded unless they are blank/newtab
    const isEligible = (!isSystemPage || isBlankPage) && (allowPinned || !tab.pinned);
    
    if (isEligible) {
      let remainingMs;
      
      // If a specific timer was set (e.g., after a settings update), use it
      if (customTimers[tab.id]) {
        remainingMs = customTimers[tab.id] - now;
      } else {
        // Otherwise, calculate based on the last time the tab was accessed
        remainingMs = globalThresholdMs - (now - tab.lastAccessed);
      }

      // If time is up, discard the tab
      if (remainingMs <= 0) {
        browser.tabs.discard(tab.id).catch(() => {});
        
        // Clean up the custom timer if it existed
        if (customTimers[tab.id]) {
          delete customTimers[tab.id];
          await browser.storage.local.set({ timers: customTimers });
        }
      }
    }
  }
};

/**
 * Reset custom timers when a tab becomes active.
 */
browser.tabs.onActivated.addListener(async (activeInfo) => {
  const data = await browser.storage.local.get('timers');
  if (data.timers && data.timers[activeInfo.tabId]) {
    delete data.timers[activeInfo.tabId];
    await browser.storage.local.set({ timers: data.timers });
  }
});

// Setup periodic check
browser.alarms.create("checkTabsAlarm", { periodInMinutes: 1 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkTabsAlarm") checkInactiveTabs();
});

// Initial run
checkInactiveTabs();

// install config when install extension
browser.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    browser.tabs.create({ url: "install.html" });
  }
  browser.alarms.create("checkTabsAlarm", { periodInMinutes: 1 });
});
