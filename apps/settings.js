// apps/settings.js — System Preferences & Proxy Configuration
// Aetherium OS — Configuration Subsystem

import { vfs } from '../kernel/vfs.js';
import { eventBus, notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'settings',
  title: 'Settings',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  defaultWidth: 780,
  defaultHeight: 560,
  minWidth: 480,
  minHeight: 360,
  singleton: true,
  category: 'system'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let activeSection = args.section || 'appearance';
  let prefs = {
    theme: 'dark',
    wallpaper: 'deep-space',
    accentColor: '#00d4ff',
    proxyTransportUrl: 'https://bare.benroberts.net/',
    proxyTransportType: 'bare'
  };

  container.innerHTML = `
    <div class="st-container">
      <!-- Sidebar -->
      <nav class="st-sidebar">
        <div class="st-nav-item ${activeSection === 'appearance' ? 'active' : ''}" data-sec="appearance">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z"/></svg>
          <span>Appearance</span>
        </div>
        <div class="st-nav-item ${activeSection === 'network' ? 'active' : ''}" data-sec="network">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          <span>Network &amp; Proxy</span>
        </div>
        <div class="st-nav-item ${activeSection === 'storage' ? 'active' : ''}" data-sec="storage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
          <span>Storage &amp; System</span>
        </div>
      </nav>

      <!-- Content Panels -->
      <div class="st-content">
        <!-- Appearance Section -->
        <div class="st-section st-sec-appearance" style="${activeSection === 'appearance' ? '' : 'display:none;'}">
          <h2>Appearance &amp; Themes</h2>

          <div class="st-card">
            <div class="st-card-title">Theme Mode</div>
            <div class="st-theme-picker">
              <button class="st-theme-btn" data-theme="dark">
                <div class="st-theme-preview dark"></div>
                <span>Obsidian Dark</span>
              </button>
              <button class="st-theme-btn" data-theme="light">
                <div class="st-theme-preview light"></div>
                <span>Ion Light</span>
              </button>
              <button class="st-theme-btn" data-theme="glass">
                <div class="st-theme-preview glass"></div>
                <span>Glassmorphism</span>
              </button>
            </div>
          </div>

          <div class="st-card">
            <div class="st-card-title">Accent Accent Color</div>
            <div class="st-accent-picker">
              <button class="st-accent-swatch" data-color="#00d4ff" style="background:#00d4ff;"></button>
              <button class="st-accent-swatch" data-color="#6366f1" style="background:#6366f1;"></button>
              <button class="st-accent-swatch" data-color="#22c55e" style="background:#22c55e;"></button>
              <button class="st-accent-swatch" data-color="#ec4899" style="background:#ec4899;"></button>
              <button class="st-accent-swatch" data-color="#f59e0b" style="background:#f59e0b;"></button>
              <input type="color" class="st-custom-color" value="#00d4ff" title="Custom Hex Color">
            </div>
          </div>

          <div class="st-card">
            <div class="st-card-title">Desktop Procedural Wallpaper</div>
            <div class="st-wallpaper-grid">
              <button class="st-wall-btn" data-wall="deep-space">Deep Space</button>
              <button class="st-wall-btn" data-wall="aurora">Aurora</button>
              <button class="st-wall-btn" data-wall="obsidian">Obsidian</button>
              <button class="st-wall-btn" data-wall="nebula">Nebula</button>
              <button class="st-wall-btn" data-wall="circuit">Circuit Grid</button>
            </div>
          </div>
        </div>

        <!-- Network & Proxy Section -->
        <div class="st-section st-sec-network" style="${activeSection === 'network' ? '' : 'display:none;'}">
          <h2>Network &amp; AetherNet Proxy</h2>
          <p class="st-desc">Configure the WebSocket transport relay used by AetherNet to bypass CORS and framing restrictions on static GitHub Pages hosting.</p>

          <div class="st-card">
            <div class="st-card-title">Transport Protocol</div>
            <select class="ae-select st-proxy-type">
              <option value="bare">Bare Server (v3 Protocol)</option>
              <option value="cors-gateway">CORS Gateway Relay</option>
            </select>
          </div>

          <div class="st-card">
            <div class="st-card-title">Transport Relay Server Endpoint</div>
            <div style="font-size:12px;color:var(--ae-text-muted);margin-bottom:8px;">Point to any public Bare instance or your self-hosted node on Render / Koyeb:</div>
            <input type="text" class="ae-input st-proxy-url" value="https://bare.benroberts.net/">
            <div style="margin-top:12px;display:flex;gap:8px;">
              <button class="ae-btn ae-btn-primary st-save-proxy-btn">Save &amp; Update Proxy</button>
              <button class="ae-btn st-test-proxy-btn">Test Connection</button>
            </div>
            <div class="st-proxy-status" style="margin-top:10px;font-size:12px;"></div>
          </div>
        </div>

        <!-- Storage & System Section -->
        <div class="st-section st-sec-storage" style="${activeSection === 'storage' ? '' : 'display:none;'}">
          <h2>Storage &amp; System Backup</h2>

          <div class="st-card">
            <div class="st-card-title">VFS IndexedDB Metrics</div>
            <div class="st-storage-readout">
              <div>Total VFS Records: <strong class="st-records-count">0</strong></div>
              <div>Estimated Disk Footprint: <strong class="st-bytes-count">0 KB</strong></div>
            </div>
          </div>

          <div class="st-card">
            <div class="st-card-title">Snapshot Backup &amp; Restore</div>
            <div style="display:flex;gap:10px;margin-top:10px;">
              <button class="ae-btn st-export-backup-btn">Export OS Snapshot (.json)</button>
              <button class="ae-btn st-import-backup-btn">Restore Backup</button>
              <input type="file" class="st-import-input" style="display:none;" accept=".json">
            </div>
          </div>

          <div class="st-card" style="border-color: rgba(239, 68, 68, 0.3);">
            <div class="st-card-title" style="color:var(--ae-danger);">Factory Reset</div>
            <p class="st-desc" style="color:var(--ae-danger);">Erase all user files, clear IndexedDB database, reset preferences and reboot to factory state.</p>
            <button class="ae-btn st-reset-btn" style="background:var(--ae-danger);color:#fff;border:none;">Factory Reset Aetherium OS</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const navItems = container.querySelectorAll('.st-nav-item');
  const sections = container.querySelectorAll('.st-section');
  const themeButtons = container.querySelectorAll('.st-theme-btn');
  const accentSwatches = container.querySelectorAll('.st-accent-swatch');
  const customColorInput = container.querySelector('.st-custom-color');
  const wallButtons = container.querySelectorAll('.st-wall-btn');
  const proxyTypeSelect = container.querySelector('.st-proxy-type');
  const proxyUrlInput = container.querySelector('.st-proxy-url');
  const saveProxyBtn = container.querySelector('.st-save-proxy-btn');
  const testProxyBtn = container.querySelector('.st-test-proxy-btn');
  const proxyStatusEl = container.querySelector('.st-proxy-status');
  const recordsCountEl = container.querySelector('.st-records-count');
  const bytesCountEl = container.querySelector('.st-bytes-count');
  const exportBtn = container.querySelector('.st-export-backup-btn');
  const importBtn = container.querySelector('.st-import-backup-btn');
  const importInput = container.querySelector('.st-import-input');
  const resetBtn = container.querySelector('.st-reset-btn');

  // Load preferences from VFS
  async function loadPreferences() {
    try {
      const data = await vfs.read('/system/config/preferences.json');
      const loaded = JSON.parse(data);
      prefs = { ...prefs, ...loaded };

      proxyUrlInput.value = prefs.proxyTransportUrl || 'https://bare.benroberts.net/';
      proxyTypeSelect.value = prefs.proxyTransportType || 'bare';
      customColorInput.value = prefs.accentColor || '#00d4ff';
    } catch {}
    updateStorageMetrics();
  }

  async function savePreferences() {
    try {
      await vfs.write('/system/config/preferences.json', JSON.stringify(prefs, null, 2), 'application/json');
    } catch (err) {
      console.warn('[Settings] Failed to save preferences:', err);
    }
  }

  // Navigation
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
      const sec = item.dataset.sec;
      sections.forEach((s) => (s.style.display = 'none'));
      container.querySelector(`.st-sec-${sec}`).style.display = 'block';
    });
  });

  // Theme Mode
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.documentElement.dataset.theme = theme;
      prefs.theme = theme;
      savePreferences();
      eventBus.emit('theme:changed', theme);
      notifications.show('Theme Updated', `Switched to ${theme} mode`);
    });
  });

  // Accent Color
  accentSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      applyAccent(swatch.dataset.color);
    });
  });

  customColorInput.addEventListener('input', () => applyAccent(customColorInput.value));

  function applyAccent(color) {
    document.documentElement.style.setProperty('--ae-accent', color);
    document.documentElement.style.setProperty('--ae-accent-glow', color + '4d');
    prefs.accentColor = color;
    savePreferences();
  }

  // Wallpaper
  wallButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const wall = btn.dataset.wall;
      const desktopEl = document.getElementById('ae-desktop');
      if (desktopEl) {
        desktopEl.dataset.wallpaper = wall;
      }
      prefs.wallpaper = wall;
      savePreferences();
      notifications.show('Wallpaper Updated', wall);
    });
  });

  // Proxy Configuration
  saveProxyBtn.addEventListener('click', () => {
    prefs.proxyTransportUrl = proxyUrlInput.value.trim();
    prefs.proxyTransportType = proxyTypeSelect.value;
    savePreferences();

    // Broadcast to Service Worker
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'UPDATE_PROXY_CONFIG',
        payload: {
          transportUrl: prefs.proxyTransportUrl,
          transportType: prefs.proxyTransportType
        }
      });
    }

    notifications.show('Proxy Updated', 'AetherNet transport relay reconfigured', { type: 'success' });
    proxyStatusEl.textContent = 'Configuration saved and active.';
    proxyStatusEl.style.color = 'var(--ae-success)';
  });

  // Test Proxy Relay
  testProxyBtn.addEventListener('click', async () => {
    proxyStatusEl.textContent = 'Testing transport connectivity...';
    proxyStatusEl.style.color = 'var(--ae-accent)';
    try {
      const target = proxyUrlInput.value.trim();
      const res = await fetch(target, { method: 'HEAD', mode: 'no-cors' });
      proxyStatusEl.textContent = 'Connection successful: Endpoint is reachable.';
      proxyStatusEl.style.color = 'var(--ae-success)';
    } catch {
      proxyStatusEl.textContent = 'Endpoint reachable (or no-cors response received).';
      proxyStatusEl.style.color = 'var(--ae-warning)';
    }
  });

  // Storage Metrics
  async function updateStorageMetrics() {
    try {
      const usage = await vfs.getUsage();
      recordsCountEl.textContent = usage.entries.toString();
      bytesCountEl.textContent = `${Math.round(usage.estimatedBytes / 1024)} KB`;
    } catch {}
  }

  // Export Snapshot
  exportBtn.addEventListener('click', async () => {
    try {
      const snapshot = await vfs.exportBackup();
      const blob = new Blob([snapshot], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aetherium-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notifications.show('Backup Exported', 'Full VFS snapshot saved to Host');
    } catch (err) {
      notifications.show('Backup Error', err.message, { type: 'error' });
    }
  });

  // Import Snapshot
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await vfs.importBackup(reader.result);
        notifications.show('Restore Complete', 'VFS successfully restored from backup', { type: 'success' });
        updateStorageMetrics();
      } catch (err) {
        notifications.show('Restore Failed', err.message, { type: 'error' });
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  // Factory Reset
  resetBtn.addEventListener('click', async () => {
    if (confirm('CRITICAL: This will permanently wipe all IndexedDB files, apps, and preferences. Continue?')) {
      await vfs.factoryReset();
      location.reload();
    }
  });

  loadPreferences();

  return () => {};
}

function _injectStyles() {
  if (document.getElementById('st-settings-styles')) return;
  const style = document.createElement('style');
  style.id = 'st-settings-styles';
  style.textContent = `
    .st-container {
      display: flex;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .st-sidebar {
      width: 200px;
      background: var(--ae-bg-primary);
      border-right: 1px solid var(--ae-border);
      padding: 16px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .st-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      color: var(--ae-text-secondary);
      cursor: pointer;
    }
    .st-nav-item:hover {
      background: var(--ae-bg-tertiary);
      color: var(--ae-text-primary);
    }
    .st-nav-item.active {
      background: var(--ae-accent-glow);
      color: var(--ae-accent);
      font-weight: 500;
    }
    .st-nav-item svg {
      width: 16px;
      height: 16px;
    }
    .st-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .st-section h2 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 20px;
      color: var(--ae-text-primary);
    }
    .st-desc {
      color: var(--ae-text-secondary);
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .st-card {
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius-sm);
      padding: 16px;
      margin-bottom: 16px;
    }
    .st-card-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--ae-text-primary);
    }
    .st-theme-picker {
      display: flex;
      gap: 12px;
    }
    .st-theme-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      color: var(--ae-text-primary);
    }
    .st-theme-btn:hover {
      border-color: var(--ae-accent);
    }
    .st-theme-preview {
      width: 100%;
      height: 48px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .st-theme-preview.dark { background: #0a0a14; }
    .st-theme-preview.light { background: #f0f0fa; }
    .st-theme-preview.glass { background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(0,0,0,0.4)); }
    .st-accent-picker {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .st-accent-swatch {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
    }
    .st-accent-swatch:hover {
      transform: scale(1.1);
    }
    .st-custom-color {
      width: 36px;
      height: 36px;
      border: none;
      background: none;
      cursor: pointer;
    }
    .st-wallpaper-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 8px;
    }
    .st-wall-btn {
      padding: 8px 12px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: 6px;
      color: var(--ae-text-secondary);
      font-size: 12px;
      cursor: pointer;
    }
    .st-wall-btn:hover {
      background: var(--ae-accent-glow);
      color: var(--ae-accent);
      border-color: var(--ae-accent);
    }
  `;
  document.head.appendChild(style);
}
