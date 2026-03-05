const ms = (d, u) => d * ({s:1e3, m:6e4, h:36e5}[u] || 6e4);

const check = async () => {
  const {delay: d=15, unit: u='m', pin: p=false} = await browser.storage.local.get();
  const limit = Date.now() - ms(d, u);
  
  const tabs = await browser.tabs.query({active: false, discarded: false, audible: false});
  
  tabs.filter(t => {
    const url = t.url || "";
    const isSystem = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlank = url === 'about:newtab' || url === 'about:blank' || url === 'about:home' || url === '';
    const canDiscard = !isSystem || isBlank;
    return canDiscard && (p || !t.pinned) && t.lastAccessed < limit;
  }).forEach(t => browser.tabs.discard(t.id).catch(() => {}));
};

browser.alarms.create("checkTabs", { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkTabs") check();
});

check();

browser.runtime.onInstalled.addListener(d => {
  if (d.reason === "install") {
    browser.tabs.create({url: "install.html"});
  }
  browser.alarms.create("checkTabs", { periodInMinutes: 1 });
});
