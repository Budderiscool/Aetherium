// kernel/boot.js — Aetherium OS Bootloader, Initialization Sequence & Desktop Shell
// Aetherium OS — Kernel Orchestrator

import { vfs, normalizePath, basename } from './vfs.js';
import { eventBus, processRegistry, notifications } from './ipc.js';
import { wm } from './wm.js';

// Static App Imports for deterministic synchronous registration
import * as BrowserApp from '../apps/browser.js';
import * as FilesApp from '../apps/files.js';
import * as TerminalApp from '../apps/terminal.js';
import * as EditorApp from '../apps/editor.js';
import * as MonitorApp from '../apps/monitor.js';
import * as SettingsApp from '../apps/settings.js';
import * as CalculatorApp from '../apps/calculator.js';
import * as NotesApp from '../apps/notes.js';
import * as MediaPlayerApp from '../apps/mediaplayer.js';

// Application Registry
const appRegistry = new Map();

// Synchronously register all core applications
const coreApps = [
  BrowserApp,
  FilesApp,
  TerminalApp,
  EditorApp,
  MonitorApp,
  SettingsApp,
  CalculatorApp,
  NotesApp,
  MediaPlayerApp
];

coreApps.forEach((app) => {
  if (app.appInfo && app.appInfo.id) {
    appRegistry.set(app.appInfo.id, app);
  }
});

// Global System State
let activeUser = 'Aether Administrator';
let userPreferences = {
  theme: 'dark',
  wallpaper: 'deep-space',
  accentColor: '#00d4ff',
  dockPinned: ['files', 'terminal', 'editor', 'browser', 'monitor', 'settings']
};

/**
 * Universal Application Launcher
 * @param {string} appId
 * @param {Object} [args={}]
 * @returns {string|null} windowId
 */
export function launchApp(appId, args = {}) {
  const appModule = appRegistry.get(appId);
  if (!appModule) {
    console.error(`[AetherKernel] App '${appId}' not found in registry.`);
    notifications.show('Application Error', `App '${appId}' is not registered.`, { type: 'error' });
    return null;
  }

  const { appInfo, launch } = appModule;

  // Singleton Check: If single-instance app already open, focus and restore it
  if (appInfo.singleton) {
    for (const [winId, win] of wm.getWindows().entries()) {
      if (win.appId === appId) {
        if (win.isMinimized) wm.restoreWindow(winId);
        wm.focusWindow(winId);
        return winId;
      }
    }
  }

  const winId = wm.createWindow({
    appId: appInfo.id,
    title: appInfo.title,
    icon: appInfo.icon,
    width: appInfo.defaultWidth,
    height: appInfo.defaultHeight,
    minWidth: appInfo.minWidth,
    minHeight: appInfo.minHeight,
    content: (contentEl) => launch(contentEl, winId, args)
  });

  updateDock();
  return winId;
}

// Expose globals for developer console & cross-app scripting
window.launchApp = launchApp;
window.appRegistry = appRegistry;
window.vfs = vfs;
window.wm = wm;
window.eventBus = eventBus;
window.processRegistry = processRegistry;

/* ============================================================
   2. Cinematic Boot Sequence
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const bootScreen = document.getElementById('ae-boot-screen');
  const bootLog = document.getElementById('ae-boot-log');
  const progressBar = document.getElementById('ae-boot-progress-bar');
  const statusText = document.getElementById('ae-boot-status-text');
  const verboseToggle = document.getElementById('ae-verbose-toggle');
  const lockScreen = document.getElementById('ae-lock-screen');
  const desktopEnv = document.getElementById('ae-desktop-environment');

  function logBoot(msg) {
    const line = document.createElement('div');
    line.className = 'ae-boot-line';
    line.textContent = msg;
    if (bootLog) {
      bootLog.appendChild(line);
      bootLog.scrollTop = bootLog.scrollHeight;
    }
  }

  function setStatus(text, pct) {
    if (statusText) statusText.textContent = text;
    if (progressBar) progressBar.style.width = `${pct}%`;
    logBoot(`[${pct}%] ${text}`);
  }

  // Verbose Console Toggle
  if (verboseToggle) {
    verboseToggle.addEventListener('click', () => {
      if (bootLog) {
        bootLog.style.display = bootLog.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bootScreen && bootScreen.style.display !== 'none') {
      if (bootLog) bootLog.style.display = bootLog.style.display === 'none' ? 'block' : 'none';
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    setStatus('Verifying WebAssembly architecture & hardware display...', 15);
    await sleep(250);

    setStatus('Mounting POSIX Virtual File System (IndexedDB: AetheriumVFS)...', 35);
    await vfs.init();
    await sleep(200);

    setStatus('Initializing Window Compositor & 3D Acceleration...', 60);
    wm.init();
    await sleep(200);

    setStatus('Registering Service Worker & Network Proxy Relay...', 80);
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js', { scope: './' });
      } catch (swErr) {
        logBoot(`[SW] Warning: SW registration notice: ${swErr.message}`);
      }
    }
    await sleep(200);

    setStatus('Starting Aetherium desktop session...', 100);
    await sleep(350);

    // Smooth cinematic transition to Lock Screen
    bootScreen.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
    bootScreen.style.opacity = '0';
    bootScreen.style.transform = 'scale(1.03)';
    await sleep(400);
    bootScreen.style.display = 'none';

    // Transition to Lock Screen
    initLockScreen(lockScreen, desktopEnv);
  } catch (err) {
    console.error('[Aetherium Kernel Panic]:', err);
    setStatus(`Kernel error: ${err.message}`, 100);
  }
});

/* ============================================================
   3. Lock Screen & Fast Sign-In
   ============================================================ */
function initLockScreen(lockScreen, desktopEnv) {
  lockScreen.style.display = 'flex';

  const clockEl = document.getElementById('ae-lock-clock');
  const dateEl = document.getElementById('ae-lock-date');
  const passwordInput = document.getElementById('ae-lock-password');
  const lockBtn = document.getElementById('ae-lock-btn');
  const quickBtn = document.getElementById('ae-lock-quick-btn');
  const guestBtn = document.getElementById('ae-lock-guest-btn');

  function updateLockClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    if (clockEl) clockEl.textContent = `${h}:${m}`;
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  updateLockClock();
  const lockClockTimer = setInterval(updateLockClock, 1000);

  function unlock(username) {
    activeUser = username || 'Aether Administrator';
    clearInterval(lockClockTimer);

    lockScreen.style.transition = 'opacity 0.35s ease-out, transform 0.35s ease-out';
    lockScreen.style.opacity = '0';
    lockScreen.style.transform = 'scale(1.05)';

    setTimeout(() => {
      lockScreen.style.display = 'none';
      desktopEnv.classList.add('visible');
      initDesktopEnvironment();
    }, 350);
  }

  if (quickBtn) quickBtn.addEventListener('click', () => unlock('Aether Administrator'));
  if (lockBtn) lockBtn.addEventListener('click', () => unlock('Aether Administrator'));
  if (guestBtn) guestBtn.addEventListener('click', () => unlock('Guest'));

  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unlock('Aether Administrator');
    });
  }
}

/* ============================================================
   4. Desktop Environment Shell
   ============================================================ */
async function initDesktopEnvironment() {
  // Load preferences from VFS if available
  try {
    if (await vfs.exists('/system/config/preferences.json')) {
      const raw = await vfs.read('/system/config/preferences.json');
      userPreferences = { ...userPreferences, ...JSON.parse(raw) };
    }
  } catch {}

  // Apply theme & wallpaper
  document.documentElement.dataset.theme = userPreferences.theme || 'dark';
  const desktopEl = document.getElementById('ae-desktop');
  if (desktopEl) {
    desktopEl.dataset.wallpaper = userPreferences.wallpaper || 'deep-space';
  }
  if (userPreferences.accentColor) {
    document.documentElement.style.setProperty('--ae-accent', userPreferences.accentColor);
    document.documentElement.style.setProperty('--ae-accent-glow', userPreferences.accentColor + '4d');
  }

  // Setup UI components
  setupClockAndCalendar();
  setupBatteryTray();
  setupVolumeMixer();
  setupDock();
  setupAppLauncher();
  setupSpotlightSearch();
  setupSystemMenu();
  setupDesktopCanvas();
  setupContextMenu();

  // IPC Event Subscriptions
  eventBus.on('app:launch', ({ appId, args }) => launchApp(appId, args));
  eventBus.on('window:opened', () => updateDock());
  eventBus.on('window:closed', () => updateDock());
  eventBus.on('desktop:refresh', () => setupDesktopCanvas());

  notifications.show('Aetherium Online', `Session ready &bull; ${activeUser}`, { type: 'success' });

  // Auto-launch Welcome Terminal & Files on first boot
  setTimeout(() => {
    if (wm.getWindows().size === 0) {
      launchApp('terminal');
    }
  }, 400);
}

/* ============================================================
   5. Top Bar Clock, Calendar & Tray
   ============================================================ */
function setupClockAndCalendar() {
  const clockBtn = document.getElementById('ae-clock');
  const calWidget = document.getElementById('ae-calendar-widget');
  const calTitle = document.getElementById('ae-calendar-title');
  const calGrid = document.getElementById('ae-calendar-grid');
  const calTime = document.getElementById('ae-calendar-time');
  const prevBtn = document.getElementById('ae-cal-prev');
  const nextBtn = document.getElementById('ae-cal-next');

  let currentCalDate = new Date();

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    if (clockBtn) clockBtn.textContent = `${hours}:${mins}`;
    if (calTime) calTime.textContent = `${hours}:${mins}:${secs}`;
  }

  function renderCalendar(date) {
    if (!calTitle || !calGrid) return;
    calTitle.textContent = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    calGrid.innerHTML = '';

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'ae-calendar-day other-month';
      calGrid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'ae-calendar-day';
      cell.textContent = d.toString();
      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d) {
        cell.classList.add('today');
      }
      calGrid.appendChild(cell);
    }
  }

  if (clockBtn && calWidget) {
    clockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVis = calWidget.classList.contains('visible');
      closeAllOverlays();
      if (!isVis) {
        calWidget.classList.add('visible');
        renderCalendar(currentCalDate);
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCalDate = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() - 1, 1);
      renderCalendar(currentCalDate);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCalDate = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, 1);
      renderCalendar(currentCalDate);
    });
  }

  setInterval(updateClock, 1000);
  updateClock();
}

function setupBatteryTray() {
  const batEl = document.getElementById('ae-tray-battery');
  if (navigator.getBattery && batEl) {
    navigator.getBattery().then((battery) => {
      function updateBat() {
        const pct = Math.round(battery.level * 100);
        batEl.title = `Battery: ${pct}% ${battery.charging ? '(Charging)' : ''}`;
      }
      updateBat();
      battery.addEventListener('levelchange', updateBat);
      battery.addEventListener('chargingchange', updateBat);
    });
  }
}

function setupVolumeMixer() {
  const volBtn = document.getElementById('ae-tray-volume');
  const volPopup = document.getElementById('ae-volume-slider');
  const volTrack = document.getElementById('ae-vol-track');
  const volFill = document.getElementById('ae-vol-fill');
  const volValue = document.getElementById('ae-vol-value');

  let currentVolume = 80;

  if (volBtn && volPopup) {
    volBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVis = volPopup.classList.contains('visible');
      closeAllOverlays();
      if (!isVis) volPopup.classList.add('visible');
    });
  }

  if (volTrack && volFill && volValue) {
    volTrack.addEventListener('click', (e) => {
      const rect = volTrack.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      currentVolume = Math.round((x / rect.width) * 100);
      volFill.style.width = `${currentVolume}%`;
      volValue.textContent = `${currentVolume}%`;
    });
  }
}

/* ============================================================
   6. Dock with High-Resolution App Badges
   ============================================================ */
function setupDock() {
  const launcherBtn = document.getElementById('ae-app-launcher-btn');
  if (launcherBtn) {
    launcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAppLauncher();
    });
  }
  updateDock();
}

export function updateDock() {
  const dockApps = document.getElementById('ae-dock-apps');
  if (!dockApps) return;

  dockApps.innerHTML = '';
  const pinned = userPreferences.dockPinned || ['files', 'terminal', 'editor', 'browser', 'monitor', 'settings'];
  const runningWindows = Array.from(wm.getWindows().values());
  const runningAppIds = new Set(runningWindows.map((w) => w.appId));

  const allDockAppIds = Array.from(new Set([...pinned, ...runningAppIds]));

  allDockAppIds.forEach((appId) => {
    const app = appRegistry.get(appId);
    if (!app) return;

    const isRunning = runningAppIds.has(appId);
    const item = document.createElement('div');
    item.className = `ae-dock-icon ${isRunning ? 'active' : ''}`;
    item.dataset.app = appId;
    item.title = app.appInfo.title;

    item.innerHTML = `
      ${app.appInfo.icon}
      <div class="ae-dock-tooltip">${app.appInfo.title}</div>
    `;

    item.addEventListener('click', () => {
      if (isRunning) {
        const appWins = runningWindows.filter((w) => w.appId === appId);
        if (appWins.length > 0) {
          const targetWin = appWins[0];
          if (targetWin.isMinimized) {
            wm.restoreWindow(targetWin.id);
          } else if (wm.getActiveWindow() === targetWin.id) {
            wm.minimizeWindow(targetWin.id);
          } else {
            wm.focusWindow(targetWin.id);
          }
        }
      } else {
        launchApp(appId);
      }
    });

    dockApps.appendChild(item);
  });
}

/* ============================================================
   7. Application Launcher Drawer
   ============================================================ */
function setupAppLauncher() {
  const launcher = document.getElementById('ae-app-launcher');
  const searchInput = document.getElementById('ae-launcher-input');
  const grid = document.getElementById('ae-launcher-grid');

  function renderGrid(query = '') {
    if (!grid) return;
    grid.innerHTML = '';
    const q = query.toLowerCase();

    for (const [id, app] of appRegistry.entries()) {
      if (app.appInfo.title.toLowerCase().includes(q) || id.includes(q)) {
        const item = document.createElement('div');
        item.className = 'ae-launcher-item';
        item.innerHTML = `
          <div class="ae-launcher-icon ae-dock-icon" data-app="${id}">${app.appInfo.icon}</div>
          <div class="ae-launcher-label">${app.appInfo.title}</div>
        `;
        item.addEventListener('click', () => {
          launchApp(id);
          toggleAppLauncher(false);
        });
        grid.appendChild(item);
      }
    }
  }

  if (searchInput) searchInput.addEventListener('input', () => renderGrid(searchInput.value));

  if (launcher) {
    launcher.addEventListener('click', (e) => {
      if (e.target === launcher) toggleAppLauncher(false);
    });
  }

  renderGrid();
}

function toggleAppLauncher(force) {
  const launcher = document.getElementById('ae-app-launcher');
  const searchInput = document.getElementById('ae-launcher-input');
  if (!launcher) return;

  const isVis = launcher.classList.contains('visible');
  const shouldOpen = force !== undefined ? force : !isVis;

  closeAllOverlays();
  if (shouldOpen) {
    launcher.classList.add('visible');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  } else {
    launcher.classList.remove('visible');
  }
}

/* ============================================================
   8. Global Spotlight Search (Alt + Space)
   ============================================================ */
function setupSpotlightSearch() {
  const overlay = document.getElementById('ae-search-overlay');
  const searchBtn = document.getElementById('ae-search-btn');
  const input = document.getElementById('ae-search-input');
  const results = document.getElementById('ae-search-results');

  function openSearch() {
    closeAllOverlays();
    if (overlay && input && results) {
      overlay.classList.add('visible');
      input.value = '';
      results.innerHTML = '';
      results.classList.remove('has-results');
      input.focus();
    }
  }

  function closeSearch() {
    if (overlay) overlay.classList.remove('visible');
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSearch();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'Space') {
      e.preventDefault();
      if (overlay?.classList.contains('visible')) closeSearch();
      else openSearch();
    } else if (e.key === 'Escape' && overlay?.classList.contains('visible')) {
      closeSearch();
    }
  });

  if (input && results) {
    input.addEventListener('input', async () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '';
      if (!q) {
        results.classList.remove('has-results');
        return;
      }

      const matched = [];

      // Apps
      for (const [id, app] of appRegistry.entries()) {
        if (app.appInfo.title.toLowerCase().includes(q) || id.includes(q)) {
          matched.push({
            type: 'app',
            title: app.appInfo.title,
            id: id,
            icon: app.appInfo.icon,
            action: () => launchApp(id)
          });
        }
      }

      // Files
      try {
        const files = await vfs.readdir('/home/user/Desktop');
        for (const f of files) {
          if (f.name.toLowerCase().includes(q)) {
            matched.push({
              type: 'file',
              title: f.name,
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
              action: () => launchApp('editor', { filePath: f.path })
            });
          }
        }
      } catch {}

      if (matched.length > 0) {
        results.classList.add('has-results');
        matched.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'ae-search-result-item';
          row.innerHTML = `
            ${item.icon}
            <span>${item.title}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--ae-text-muted);">${item.type.toUpperCase()}</span>
          `;
          row.addEventListener('click', () => {
            item.action();
            closeSearch();
          });
          results.appendChild(row);
        });
      } else {
        results.classList.remove('has-results');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector('.ae-search-result-item');
        if (first) first.click();
      }
    });
  }
}

/* ============================================================
   9. Desktop Canvas & Context Menu
   ============================================================ */
async function setupDesktopCanvas() {
  const desktop = document.getElementById('ae-desktop');
  if (!desktop) return;

  desktop.innerHTML = '';

  try {
    const items = await vfs.readdir('/home/user/Desktop');
    items.forEach((item) => {
      const iconEl = document.createElement('div');
      iconEl.className = 'ae-desktop-icon';
      iconEl.dataset.path = item.path;

      let iconSvg = '';
      if (item.type === 'directory') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
      } else {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      }

      iconEl.innerHTML = `
        <div class="ae-desktop-icon-img">${iconSvg}</div>
        <div class="ae-desktop-icon-label">${item.name}</div>
      `;

      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        desktop.querySelectorAll('.ae-desktop-icon').forEach((i) => i.classList.remove('selected'));
        iconEl.classList.add('selected');
      });

      // Double click or tap opens file
      iconEl.addEventListener('dblclick', () => {
        if (item.type === 'directory') {
          launchApp('files', { path: item.path });
        } else {
          launchApp('editor', { filePath: item.path });
        }
      });

      desktop.appendChild(iconEl);
    });
  } catch (err) {
    console.warn('[Desktop] Error loading desktop items:', err);
  }
}

function setupContextMenu() {
  const desktop = document.getElementById('ae-desktop');
  const menu = document.getElementById('ae-context-menu');
  if (!desktop || !menu) return;

  desktop.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeAllOverlays();

    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 240)}px`;
    menu.innerHTML = `
      <div class="ae-context-item" data-action="new-folder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        <span>New Folder</span>
      </div>
      <div class="ae-context-item" data-action="new-file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        <span>New Text File</span>
      </div>
      <div class="ae-context-separator"></div>
      <div class="ae-context-item" data-action="terminal">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        <span>Open Terminal Here</span>
      </div>
      <div class="ae-context-item" data-action="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Change Appearance &amp; Wallpaper</span>
      </div>
      <div class="ae-context-separator"></div>
      <div class="ae-context-item" data-action="refresh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span>Refresh Desktop</span>
      </div>
    `;
    menu.classList.add('visible');
  });

  menu.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('.ae-context-item');
    if (!actionEl) return;
    const act = actionEl.dataset.action;

    if (act === 'new-folder') {
      const name = prompt('Folder name:', 'New Folder');
      if (name) {
        await vfs.mkdir(`/home/user/Desktop/${name}`);
        setupDesktopCanvas();
      }
    } else if (act === 'new-file') {
      const name = prompt('File name:', 'document.txt');
      if (name) {
        await vfs.write(`/home/user/Desktop/${name}`, '');
        setupDesktopCanvas();
      }
    } else if (act === 'terminal') {
      launchApp('terminal', { cwd: '/home/user/Desktop' });
    } else if (act === 'settings') {
      launchApp('settings', { section: 'appearance' });
    } else if (act === 'refresh') {
      setupDesktopCanvas();
    }

    menu.classList.remove('visible');
  });
}

/* ============================================================
   10. System Menu Dropdown (About, Sleep, Restart, Shutdown)
   ============================================================ */
function setupSystemMenu() {
  const btn = document.getElementById('ae-system-menu-btn');
  const menu = document.getElementById('ae-system-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVis = menu.classList.contains('visible');
    closeAllOverlays();
    if (!isVis) menu.classList.add('visible');
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ae-system-menu-item');
    if (!item) return;
    const act = item.dataset.action;

    if (act === 'about') {
      wm.createWindow({
        appId: 'about',
        title: 'About Aetherium',
        width: 440,
        height: 340,
        resizable: false,
        content: (el) => {
          el.innerHTML = `
            <div style="padding:28px;text-align:center;font-family:var(--ae-font-ui);color:var(--ae-text-primary);">
              <div style="font-size:26px;font-weight:700;color:var(--ae-accent);margin-bottom:6px;">Aetherium OS</div>
              <div style="font-size:12px;color:var(--ae-text-secondary);margin-bottom:16px;">Release 1.0 (Noble Gas Architecture)</div>
              <p style="font-size:13px;color:var(--ae-text-muted);line-height:1.6;">Designed for 100% static client-side deployment on GitHub Pages. Features an asynchronous POSIX virtual filesystem, hardware-accelerated window compositor, and client-side proxy browser.</p>
              <div style="margin-top:24px;font-size:11px;color:var(--ae-text-muted);">Atomic Number 119 &bull; WebAssembly ES6+ Runtime</div>
            </div>
          `;
        }
      });
    } else if (act === 'settings') {
      launchApp('settings');
    } else if (act === 'sleep') {
      const sleepOverlay = document.createElement('div');
      sleepOverlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#606078;font-family:sans-serif;font-size:14px;';
      sleepOverlay.textContent = 'Display Asleep — Click anywhere to wake';
      sleepOverlay.addEventListener('click', () => sleepOverlay.remove());
      document.body.appendChild(sleepOverlay);
    } else if (act === 'restart') {
      location.reload();
    } else if (act === 'shutdown') {
      document.body.innerHTML = `
        <div style="background:#0a0a14;color:#00d4ff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;">
          <h2 style="font-size:24px;margin-bottom:8px;">Aetherium OS has halted.</h2>
          <p style="color:#606078;">It is safe to close your browser tab or restart.</p>
          <button onclick="location.reload()" style="background:#00d4ff;color:#000;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:20px;">Restart System</button>
        </div>
      `;
    }

    menu.classList.remove('visible');
  });
}

function closeAllOverlays() {
  document.getElementById('ae-context-menu')?.classList.remove('visible');
  document.getElementById('ae-system-menu')?.classList.remove('visible');
  document.getElementById('ae-calendar-widget')?.classList.remove('visible');
  document.getElementById('ae-volume-slider')?.classList.remove('visible');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#ae-context-menu, #ae-system-menu, #ae-calendar-widget, #ae-volume-slider, #ae-system-menu-btn, #ae-clock, #ae-tray-volume')) {
    closeAllOverlays();
  }
});
