const q = s => document.querySelector(s);
let saveTimeout;

const ms = (d, u) => d * ({s:1e3, m:6e4, h:36e5}[u] || 6e4);
const formatTime = (time) => {
  if (time <= 0) return "soon";
  const s = Math.floor(time / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const updateThemeUI = (isDark) => {
  document.body.classList.toggle('dark', isDark);
  q('#theme-toggle').checked = isDark;
  q('.brand-logo img').src = isDark ? 'icon-dark.svg' : 'icon-light.svg';
};

q('#theme-toggle').onchange = (e) => {
  const isDark = e.target.checked;
  updateThemeUI(isDark);
  browser.storage.local.set({ theme: isDark ? 'dark' : 'light' });
};

const updateTimers = () => {
  const d = q('#d').value;
  const u = q('#u').value;
  const limit = ms(d || 15, u || 'm');
  const now = Date.now();
  
  document.querySelectorAll('.timer').forEach(el => {
    const last = parseInt(el.dataset.lastAccessed);
    const isActive = el.dataset.active === "true";
    const isReallyAudible = el.dataset.audible === "true";
    const isDiscarded = el.dataset.discarded === "true";

    if (isDiscarded) {
      el.innerText = '[soon]';
    } else if (!isNaN(last) && !isActive && !isReallyAudible) {
      el.innerText = `[${formatTime(limit - (now - last))}]`;
    } else {
      el.innerText = '';
    }
  });
};

const updateUI = async () => {
  const s = await browser.storage.local.get();
  const p = !!s.pin;
  const allTabs = await browser.tabs.query({});
  const list = q('#list');
  list.innerHTML = ''; 
  
  // Filter for "Manageable" tabs only
  const realTabs = allTabs.filter(t => {
    const url = t.url || "";
    const isSystem = url.startsWith('about:') || url.startsWith('chrome:');
    const isBlank = url === 'about:newtab' || url === 'about:blank' || url === 'about:home' || url === '';
    const isSystemPage = isSystem && !isBlank;
    
    if (isSystemPage) return false;
    if (!p && t.pinned) return false;
    
    return true;
  });

  // Display all loaded manageable tabs (Active, Audible, and Targets)
  const visibleTabs = realTabs.filter(t => !t.discarded);

  const loadedRealTabs = visibleTabs.length;
  q('#s').innerText = `${loadedRealTabs} / ${realTabs.length}`;

  visibleTabs.forEach(t => {
    const isReallyAudible = t.audible && !t.mutedInfo?.muted;
    const item = document.createElement('div');
    item.className = 'tab-item';
    
    const title = document.createElement('span');
    title.className = 'tab-title';
    
    const text = document.createElement('span');
    text.className = 'tab-text';
    text.innerText = t.title;
    
    // Highlight active tab
    if (t.active) {
      text.style.fontWeight = '700';
    }

    const timer = document.createElement('span');
    timer.className = 'timer';
    timer.dataset.lastAccessed = t.lastAccessed;
    timer.dataset.active = t.active;
    timer.dataset.audible = isReallyAudible;
    timer.dataset.discarded = false;

    title.append(text, timer);

    if (isReallyAudible) {
      const speaker = document.createElement('span');
      speaker.innerText = ' (Sound)';
      speaker.style.fontSize = '8px';
      speaker.style.marginLeft = '4px';
      title.append(speaker);
    }

    item.append(title);

    // Only show OFF button for non-active, non-audible tabs
    if (!t.active && !isReallyAudible) {
      const btn = document.createElement('button');
      btn.className = 'status-btn';
      btn.innerText = 'OFF';
      btn.onclick = () => browser.tabs.discard(t.id).then(updateUI).catch(() => {});
      item.append(btn);
    } else {
      const spacer = document.createElement('div');
      spacer.style.minWidth = '45px';
      // Optional: Add a small indicator for the active tab
      if (t.active) {
        spacer.innerText = 'ACTIVE';
        spacer.style.fontSize = '8px';
        spacer.style.textAlign = 'center';
        spacer.style.opacity = '0.5';
        spacer.style.fontWeight = '800';
      }
      item.append(spacer);
    }

    list.appendChild(item);
  });
  updateTimers();
};

const isValid = (val) => {
  const n = parseFloat(val);
  return !isNaN(n) && n > 0 && /^\d*\.?\d*$/.test(val);
};

const updateInputWidth = () => {
  const input = q('#d');
  const length = input.value.length || 1;
  input.style.width = `${Math.min(length + 1, 10)}ch`;
  input.classList.toggle('invalid', !isValid(input.value) && input.value !== "");
};

const save = () => {
  const dVal = q('#d').value;
  updateInputWidth();
  const btn = q('#a');
  clearTimeout(saveTimeout);
  
  if (!isValid(dVal)) {
    btn.innerText = "✖ Invalid";
    btn.style.background = "var(--danger)";
    saveTimeout = setTimeout(() => {
      btn.innerText = "Discard Others";
      btn.style.background = "";
    }, 1000);
    return;
  }

  browser.storage.local.set({delay: parseFloat(dVal), unit: q('#u').value, pin: q('#p').checked});
  btn.innerText = "✓ Saved";
  btn.style.background = "var(--accent)";
  saveTimeout = setTimeout(() => {
    btn.innerText = "Discard Others";
    btn.style.background = "";
    updateUI();
  }, 500);
};

['#d','#u','#p'].forEach(s => q(s).onchange = save);
q('#d').oninput = updateInputWidth;

q('#a').onclick = async () => {
  const s = await browser.storage.local.get();
  const tabs = await browser.tabs.query({active: false, audible: false, discarded: false});
  tabs.forEach(t => {
    const url = t.url || "";
    const isAbout = url.startsWith('about:');
    if (!isAbout && (s.pin || !t.pinned)) browser.tabs.discard(t.id);
  });
  setTimeout(updateUI, 300);
};

browser.storage.local.get().then(s => {
  q('#d').value = s.delay || 15;
  q('#u').value = s.unit || 'm';
  q('#p').checked = !!s.pin;
  updateInputWidth();
  
  if (s.theme) {
    updateThemeUI(s.theme === 'dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    updateThemeUI(prefersDark);
  }
  
  updateUI();
});

setInterval(updateTimers, 1000);
