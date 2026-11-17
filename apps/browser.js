// apps/browser.js — AetherNet Multi-Tabbed Web Proxy Browser
// Aetherium OS — Network Application Subsystem

import { vfs } from '../kernel/vfs.js';
import { eventBus, notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'browser',
  title: 'AetherNet',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  defaultWidth: 960,
  defaultHeight: 640,
  minWidth: 460,
  minHeight: 340,
  singleton: false,
  category: 'network'
};

const SEARCH_ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  brave: 'https://search.brave.com/search?q='
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let tabs = [];
  let activeTabId = null;
  let tabIdCounter = 0;
  let bookmarks = [];

  container.innerHTML = `
    <div class="an-browser-chrome">
      <!-- Tabs Bar -->
      <div class="an-tabs-bar">
        <div class="an-tabs-list"></div>
        <button class="an-btn an-new-tab-btn" title="New Tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- Navigation & Omnibox Bar -->
      <div class="an-nav-bar">
        <div class="an-nav-controls">
          <button class="an-btn an-back-btn" title="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <button class="an-btn an-forward-btn" title="Forward">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <button class="an-btn an-reload-btn" title="Reload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button class="an-btn an-home-btn" title="AetherNet Home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
        </div>

        <!-- Omnibox -->
        <div class="an-omnibox-wrap">
          <svg class="an-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input type="text" class="an-omnibox" placeholder="Search the web or enter address (e.g. duckduckgo.com)..." spellcheck="false">
          <button class="an-btn an-bookmark-btn" title="Bookmark Page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>

        <div class="an-extra-controls">
          <button class="an-btn an-devtools-btn" title="Toggle Developer Tools (Eruda)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="an-btn an-proxy-settings-btn" title="Proxy Transport Diagnostics">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      <!-- Bookmarks Bar -->
      <div class="an-bookmarks-bar"></div>

      <!-- Content Viewport -->
      <div class="an-web-viewport"></div>
    </div>
  `;

  const tabsListEl = container.querySelector('.an-tabs-list');
  const newTabBtn = container.querySelector('.an-new-tab-btn');
  const omniboxEl = container.querySelector('.an-omnibox');
  const backBtn = container.querySelector('.an-back-btn');
  const forwardBtn = container.querySelector('.an-forward-btn');
  const reloadBtn = container.querySelector('.an-reload-btn');
  const homeBtn = container.querySelector('.an-home-btn');
  const bookmarkBtn = container.querySelector('.an-bookmark-btn');
  const devtoolsBtn = container.querySelector('.an-devtools-btn');
  const proxySettingsBtn = container.querySelector('.an-proxy-settings-btn');
  const bookmarksBarEl = container.querySelector('.an-bookmarks-bar');
  const viewportEl = container.querySelector('.an-web-viewport');

  async function loadBookmarks() {
    try {
      const data = await vfs.read('/home/user/Documents/bookmarks.json');
      const parsed = JSON.parse(data);
      bookmarks = parsed.bookmarks || [];
    } catch {
      bookmarks = [
        { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
        { title: 'Wikipedia', url: 'https://wikipedia.org' },
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Hacker News', url: 'https://news.ycombinator.com' }
      ];
    }
    renderBookmarks();
  }

  function renderBookmarks() {
    bookmarksBarEl.innerHTML = '';
    bookmarks.forEach((bm) => {
      const item = document.createElement('button');
      item.className = 'an-bookmark-item';
      item.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        <span>${bm.title}</span>
      `;
      item.addEventListener('click', () => navigateActiveTab(bm.url));
      bookmarksBarEl.appendChild(item);
    });
  }

  function createTab(initialUrl = 'aether://home') {
    const tabId = `tab-${++tabIdCounter}`;
    
    const iframe = document.createElement('iframe');
    iframe.className = 'an-tab-frame';
    iframe.id = `frame-${tabId}`;
    iframe.setAttribute('allow', 'fullscreen; camera; microphone; clipboard-read; clipboard-write');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
    
    viewportEl.appendChild(iframe);

    const tab = {
      id: tabId,
      title: 'New Tab',
      url: initialUrl,
      frame: iframe,
      history: [initialUrl],
      historyIndex: 0
    };

    tabs.push(tab);
    renderTabs();
    selectTab(tabId);
    navigateTab(tab, initialUrl);
  }

  function selectTab(tabId) {
    activeTabId = tabId;
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    tabs.forEach((t) => {
      t.frame.style.display = t.id === tabId ? 'block' : 'none';
    });

    omniboxEl.value = tab.url === 'aether://home' ? '' : tab.url;
    wm.setTitle(windowId, `AetherNet — ${tab.title}`);
    renderTabs();
  }

  function closeTab(tabId, e) {
    if (e) e.stopPropagation();
    if (tabs.length === 1) {
      navigateActiveTab('aether://home');
      return;
    }

    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const [removed] = tabs.splice(index, 1);
    removed.frame.remove();

    if (activeTabId === tabId) {
      const nextTab = tabs[Math.max(0, index - 1)];
      selectTab(nextTab.id);
    } else {
      renderTabs();
    }
  }

  function renderTabs() {
    tabsListEl.innerHTML = '';
    tabs.forEach((tab) => {
      const tabEl = document.createElement('div');
      tabEl.className = `an-tab ${tab.id === activeTabId ? 'active' : ''}`;
      tabEl.innerHTML = `
        <span class="an-tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
        </span>
        <span class="an-tab-title">${tab.title}</span>
        <button class="an-tab-close" title="Close Tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      tabEl.addEventListener('click', () => selectTab(tab.id));
      tabEl.querySelector('.an-tab-close').addEventListener('click', (e) => closeTab(tab.id, e));
      tabsListEl.appendChild(tabEl);
    });
  }

  function getStartPageHtml() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(ellipse at 50% 30%, #151528 0%, #0a0a14 70%);
      color: #e8e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 32px;
    }
    .brand-logo {
      width: 64px;
      height: 64px;
      margin-bottom: 12px;
      filter: drop-shadow(0 0 16px rgba(0,212,255,0.4));
    }
    .brand-title {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #00d4ff, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .search-box {
      width: 100%;
      max-width: 560px;
      margin-bottom: 40px;
      display: flex;
      background: rgba(25, 25, 40, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 6px 8px 6px 20px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.4);
      backdrop-filter: blur(16px);
    }
    .search-box input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: #fff;
      font-size: 16px;
    }
    .search-box button {
      background: #00d4ff;
      border: none;
      color: #000;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: 20px;
      cursor: pointer;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(4, 110px);
      gap: 16px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: rgba(25, 25, 40, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px 8px;
      text-decoration: none;
      color: #e8e8f0;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .tile:hover {
      background: rgba(0, 212, 255, 0.15);
      border-color: #00d4ff;
      transform: translateY(-3px);
    }
    .tile-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      font-size: 18px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="brand">
    <svg class="brand-logo" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="30" stroke="#00d4ff" stroke-width="2.5" fill="rgba(0,212,255,0.05)"/>
      <ellipse cx="32" cy="32" rx="14" ry="30" stroke="#6366f1" stroke-width="2"/>
      <line x1="2" y1="32" x2="62" y2="32" stroke="#00d4ff" stroke-width="2"/>
    </svg>
    <div class="brand-title">AetherNet</div>
  </div>

  <form class="search-box" onsubmit="event.preventDefault(); window.parent.postMessage({type:'NAVIGATE', url: document.getElementById('q').value}, '*');">
    <input type="text" id="q" placeholder="Search with DuckDuckGo or type a URL..." autofocus>
    <button type="submit">Search</button>
  </form>

  <div class="tiles">
    <div class="tile" onclick="window.parent.postMessage({type:'NAVIGATE', url:'https://duckduckgo.com'}, '*')">
      <div class="tile-icon" style="color:#de5833;">🦆</div>
      <span>DuckDuckGo</span>
    </div>
    <div class="tile" onclick="window.parent.postMessage({type:'NAVIGATE', url:'https://wikipedia.org'}, '*')">
      <div class="tile-icon" style="color:#fff;">W</div>
      <span>Wikipedia</span>
    </div>
    <div class="tile" onclick="window.parent.postMessage({type:'NAVIGATE', url:'https://github.com'}, '*')">
      <div class="tile-icon" style="color:#a0a0b8;">🐙</div>
      <span>GitHub</span>
    </div>
    <div class="tile" onclick="window.parent.postMessage({type:'NAVIGATE', url:'https://news.ycombinator.com'}, '*')">
      <div class="tile-icon" style="color:#ff6600;">Y</div>
      <span>Hacker News</span>
    </div>
  </div>
</body>
</html>`;
  }

  function resolveUrl(input) {
    const trimmed = input.trim();
    if (!trimmed || trimmed === 'aether://home') return 'aether://home';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed) && !trimmed.includes(' ')) return 'https://' + trimmed;
    return SEARCH_ENGINES.duckduckgo + encodeURIComponent(trimmed);
  }

  function navigateTab(tab, rawUrl) {
    const targetUrl = resolveUrl(rawUrl);
    tab.url = targetUrl;

    if (targetUrl === 'aether://home') {
      tab.title = 'New Tab';
      tab.frame.srcdoc = getStartPageHtml();
      omniboxEl.value = '';
    } else {
      tab.title = targetUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'Web Page';
      const proxyUrl = `./__aether_proxy__/${encodeURIComponent(targetUrl)}`;
      tab.frame.removeAttribute('srcdoc');
      tab.frame.src = proxyUrl;
      omniboxEl.value = targetUrl;
    }

    wm.setTitle(windowId, `AetherNet — ${tab.title}`);
    renderTabs();
  }

  function navigateActiveTab(url) {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab) {
      if (tab.history[tab.historyIndex] !== url) {
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push(url);
        tab.historyIndex = tab.history.length - 1;
      }
      navigateTab(tab, url);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'NAVIGATE' && e.data?.url) {
      navigateActiveTab(e.data.url);
    }
  });

  omniboxEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateActiveTab(omniboxEl.value);
  });

  backBtn.addEventListener('click', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.historyIndex > 0) {
      tab.historyIndex--;
      navigateTab(tab, tab.history[tab.historyIndex]);
    }
  });

  forwardBtn.addEventListener('click', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.historyIndex < tab.history.length - 1) {
      tab.historyIndex++;
      navigateTab(tab, tab.history[tab.historyIndex]);
    }
  });

  reloadBtn.addEventListener('click', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab) navigateTab(tab, tab.url);
  });

  homeBtn.addEventListener('click', () => navigateActiveTab('aether://home'));
  newTabBtn.addEventListener('click', () => createTab());

  bookmarkBtn.addEventListener('click', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.url === 'aether://home') return;
    const exists = bookmarks.some((b) => b.url === tab.url);
    if (exists) {
      bookmarks = bookmarks.filter((b) => b.url !== tab.url);
      notifications.show('Bookmark Removed', tab.title, { type: 'info' });
    } else {
      bookmarks.push({ title: tab.title, url: tab.url });
      notifications.show('Bookmark Saved', tab.title, { type: 'success' });
    }
    renderBookmarks();
  });

  devtoolsBtn.addEventListener('click', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || !tab.frame.contentWindow) return;
    try {
      const script = tab.frame.contentDocument.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/eruda';
      script.onload = () => tab.frame.contentWindow.eruda?.init();
      tab.frame.contentDocument.head.appendChild(script);
      notifications.show('DevTools', 'Eruda inspector activated inside tab', { type: 'info' });
    } catch {
      notifications.show('DevTools', 'Cannot inject into cross-origin frame.', { type: 'warning' });
    }
  });

  proxySettingsBtn.addEventListener('click', () => {
    eventBus.emit('app:launch', { appId: 'settings', args: { section: 'network' } });
  });

  loadBookmarks();
  createTab(args.url || 'aether://home');

  return () => {
    tabs.forEach((t) => t.frame.remove());
    tabs = [];
  };
}

function _injectStyles() {
  if (document.getElementById('an-browser-styles')) return;
  const style = document.createElement('style');
  style.id = 'an-browser-styles';
  style.textContent = `
    .an-browser-chrome {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .an-tabs-bar {
      display: flex;
      align-items: center;
      height: 38px;
      background: rgba(10, 10, 20, 0.95);
      padding: 0 8px;
      gap: 4px;
      border-bottom: 1px solid var(--ae-border);
      overflow-x: auto;
    }
    .an-tabs-list {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      overflow-x: auto;
    }
    .an-tab {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 28px;
      padding: 0 10px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      max-width: 180px;
      user-select: none;
    }
    .an-tab.active {
      background: var(--ae-bg-primary);
      border-color: var(--ae-accent);
      color: var(--ae-accent);
    }
    .an-tab-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .an-tab-close {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 2px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
    }
    .an-tab-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); }
    .an-tab-close svg, .an-tab-icon svg { width: 12px; height: 12px; }
    .an-nav-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--ae-bg-secondary);
      border-bottom: 1px solid var(--ae-border);
    }
    .an-nav-controls, .an-extra-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .an-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--ae-text-secondary);
      cursor: pointer;
    }
    .an-btn:hover { background: var(--ae-bg-tertiary); color: var(--ae-text-primary); }
    .an-btn svg { width: 16px; height: 16px; }
    .an-omnibox-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      background: var(--ae-bg-solid);
      border: 1px solid var(--ae-border);
      border-radius: 20px;
      padding: 0 10px;
      gap: 6px;
    }
    .an-omnibox-wrap:focus-within {
      border-color: var(--ae-accent);
      box-shadow: 0 0 0 2px var(--ae-accent-glow);
    }
    .an-lock-icon { width: 14px; height: 14px; color: var(--ae-success); }
    .an-omnibox {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--ae-text-primary);
      font-size: 13px;
      padding: 6px 0;
    }
    .an-bookmarks-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: rgba(15, 15, 25, 0.7);
      border-bottom: 1px solid var(--ae-border);
      overflow-x: auto;
    }
    .an-bookmark-item {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--ae-text-secondary);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .an-bookmark-item:hover { background: var(--ae-bg-tertiary); color: var(--ae-text-primary); }
    .an-bookmark-item svg { width: 12px; height: 12px; }
    .an-web-viewport {
      flex: 1;
      position: relative;
      background: #0a0a14;
    }
    .an-tab-frame {
      width: 100%;
      height: 100%;
      border: none;
      position: absolute;
      inset: 0;
      background: #0a0a14;
    }
  `;
  document.head.appendChild(style);
}
