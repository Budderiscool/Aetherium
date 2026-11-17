// apps/files.js — Dual-Pane POSIX File Explorer & Asset Previewer
// Aetherium OS — File Management Subsystem

import { vfs, normalizePath, dirname, basename, guessMime } from '../kernel/vfs.js';
import { eventBus, notifications, clipboard } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'files',
  title: 'Files',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  defaultWidth: 920,
  defaultHeight: 620,
  minWidth: 500,
  minHeight: 380,
  singleton: true,
  category: 'system'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let currentPath = args.path || '/home/user';
  let history = [currentPath];
  let historyIndex = 0;
  let viewMode = 'grid'; // 'grid' | 'list'
  let selectedPaths = new Set();
  let clipboardOp = null; // { action: 'copy'|'cut', path: string }

  container.innerHTML = `
    <div class="fe-container">
      <!-- Toolbar -->
      <div class="fe-toolbar">
        <div class="fe-nav-buttons">
          <button class="fe-btn fe-back-btn" title="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <button class="fe-btn fe-forward-btn" title="Forward">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <button class="fe-btn fe-up-btn" title="Parent Directory">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>

        <!-- Breadcrumb Path Bar -->
        <div class="fe-breadcrumb-bar"></div>

        <!-- Actions -->
        <div class="fe-actions">
          <button class="fe-btn fe-new-folder-btn" title="New Folder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </button>
          <button class="fe-btn fe-upload-btn" title="Upload from Host OS">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <input type="file" class="fe-file-input" style="display:none;" multiple>
          </button>
          <button class="fe-btn fe-download-btn" title="Export Selected File to Host OS">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <div class="fe-separator"></div>
          <button class="fe-btn fe-view-toggle-btn" title="Toggle Grid/List View">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
        </div>
      </div>

      <!-- Main Body: Sidebar + File List -->
      <div class="fe-body">
        <!-- Sidebar Navigation Tree -->
        <aside class="fe-sidebar">
          <div class="fe-sidebar-group-title">PLACES</div>
          <div class="fe-sidebar-item" data-path="/home/user">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Home</span>
          </div>
          <div class="fe-sidebar-item" data-path="/home/user/Desktop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>Desktop</span>
          </div>
          <div class="fe-sidebar-item" data-path="/home/user/Documents">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Documents</span>
          </div>
          <div class="fe-sidebar-item" data-path="/home/user/Downloads">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Downloads</span>
          </div>
          <div class="fe-sidebar-item" data-path="/home/user/Pictures">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Pictures</span>
          </div>
          <div class="fe-sidebar-item" data-path="/home/user/Music">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <span>Music</span>
          </div>

          <div class="fe-sidebar-group-title" style="margin-top: 16px;">STORAGE</div>
          <div class="fe-sidebar-item" data-path="/system">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>System</span>
          </div>
          <div class="fe-sidebar-item" data-path="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
            <span>Root (/)</span>
          </div>
        </aside>

        <!-- Content Area -->
        <div class="fe-view-area"></div>
      </div>

      <!-- Status Bar -->
      <div class="fe-statusbar">
        <span class="fe-status-count">0 items</span>
        <span class="fe-status-selected"></span>
      </div>

      <!-- Preview Modal -->
      <div class="fe-preview-modal" style="display:none;">
        <div class="fe-preview-card">
          <div class="fe-preview-header">
            <span class="fe-preview-title">Preview</span>
            <button class="fe-preview-close">&times;</button>
          </div>
          <div class="fe-preview-body"></div>
        </div>
      </div>
    </div>
  `;

  const breadcrumbBar = container.querySelector('.fe-breadcrumb-bar');
  const viewArea = container.querySelector('.fe-view-area');
  const statusCount = container.querySelector('.fe-status-count');
  const statusSelected = container.querySelector('.fe-status-selected');
  const backBtn = container.querySelector('.fe-back-btn');
  const forwardBtn = container.querySelector('.fe-forward-btn');
  const upBtn = container.querySelector('.fe-up-btn');
  const newFolderBtn = container.querySelector('.fe-new-folder-btn');
  const uploadBtn = container.querySelector('.fe-upload-btn');
  const fileInput = container.querySelector('.fe-file-input');
  const downloadBtn = container.querySelector('.fe-download-btn');
  const viewToggleBtn = container.querySelector('.fe-view-toggle-btn');
  const sidebarItems = container.querySelectorAll('.fe-sidebar-item');
  const previewModal = container.querySelector('.fe-preview-modal');
  const previewBody = container.querySelector('.fe-preview-body');
  const previewTitle = container.querySelector('.fe-preview-title');
  const previewClose = container.querySelector('.fe-preview-close');

  async function loadDirectory(path) {
    currentPath = normalizePath(path);
    selectedPaths.clear();
    updateSidebarHighlight();
    renderBreadcrumbs();

    try {
      const items = await vfs.readdir(currentPath);
      renderItems(items);
      statusCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
      statusSelected.textContent = '';
      wm.setTitle(windowId, `Files — ${currentPath}`);
    } catch (err) {
      viewArea.innerHTML = `<div class="fe-empty">Error reading directory: ${err.message}</div>`;
    }
  }

  function renderBreadcrumbs() {
    breadcrumbBar.innerHTML = '';
    const parts = currentPath.split('/').filter(Boolean);
    
    // Root button
    const rootEl = document.createElement('span');
    rootEl.className = 'fe-crumb';
    rootEl.textContent = 'AetherVFS';
    rootEl.addEventListener('click', () => navigate('/'));
    breadcrumbBar.appendChild(rootEl);

    let accum = '';
    parts.forEach((p) => {
      accum += '/' + p;
      const target = accum;
      const sep = document.createElement('span');
      sep.className = 'fe-crumb-sep';
      sep.textContent = '>';
      breadcrumbBar.appendChild(sep);

      const crumb = document.createElement('span');
      crumb.className = 'fe-crumb';
      crumb.textContent = p;
      crumb.addEventListener('click', () => navigate(target));
      breadcrumbBar.appendChild(crumb);
    });
  }

  function renderItems(items) {
    viewArea.innerHTML = '';

    if (items.length === 0) {
      viewArea.innerHTML = `<div class="fe-empty">This folder is empty</div>`;
      return;
    }

    if (viewMode === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'fe-grid';
      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'fe-card';
        card.dataset.path = item.path;

        let iconSvg = '';
        if (item.type === 'directory') {
          iconSvg = `<svg class="fe-icon-folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
        } else {
          iconSvg = `<svg class="fe-icon-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        }

        card.innerHTML = `
          <div class="fe-card-icon">${iconSvg}</div>
          <div class="fe-card-name" title="${item.name}">${item.name}</div>
        `;

        card.addEventListener('click', (e) => handleItemSelect(item.path, card, e));
        card.addEventListener('dblclick', () => handleItemOpen(item));
        grid.appendChild(card);
      });
      viewArea.appendChild(grid);
    } else {
      // List Mode
      const table = document.createElement('table');
      table.className = 'fe-list-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Type</th>
            <th>Modified</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      items.forEach((item) => {
        const row = document.createElement('tr');
        row.dataset.path = item.path;
        const sizeFormatted = item.type === 'directory' ? '--' : _formatBytes(item.size);
        const dateFormatted = new Date(item.modified).toLocaleDateString();

        row.innerHTML = `
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              ${item.type === 'directory' 
                ? '<svg class="fe-icon-folder" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' 
                : '<svg class="fe-icon-file" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'}
              <span>${item.name}</span>
            </div>
          </td>
          <td>${sizeFormatted}</td>
          <td>${item.type}</td>
          <td>${dateFormatted}</td>
        `;

        row.addEventListener('click', (e) => handleItemSelect(item.path, row, e));
        row.addEventListener('dblclick', () => handleItemOpen(item));
        tbody.appendChild(row);
      });
      viewArea.appendChild(table);
    }
  }

  function handleItemSelect(path, el, e) {
    if (!e.ctrlKey && !e.metaKey) {
      selectedPaths.clear();
      viewArea.querySelectorAll('.selected').forEach((c) => c.classList.remove('selected'));
    }
    selectedPaths.add(path);
    el.classList.add('selected');
    statusSelected.textContent = `${selectedPaths.size} selected`;
  }

  async function handleItemOpen(item) {
    if (item.type === 'directory') {
      navigate(item.path);
    } else {
      const mime = item.mime || guessMime(item.name);
      
      // Images: show preview modal directly
      if (mime.startsWith('image/')) {
        try {
          const content = await vfs.read(item.path);
          previewTitle.textContent = item.name;
          previewBody.innerHTML = `<img src="${content}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px;">`;
          previewModal.style.display = 'flex';
        } catch (err) {
          notifications.show('Preview Error', err.message, { type: 'error' });
        }
        return;
      }

      // Audio/Video
      if (mime.startsWith('audio/') || mime.startsWith('video/')) {
        eventBus.emit('app:launch', { appId: 'mediaplayer', args: { filePath: item.path } });
        return;
      }

      // Code & Text Editor
      eventBus.emit('app:launch', { appId: 'editor', args: { filePath: item.path } });
    }
  }

  function navigate(path) {
    if (history[historyIndex] !== path) {
      history = history.slice(0, historyIndex + 1);
      history.push(path);
      historyIndex = history.length - 1;
    }
    loadDirectory(path);
  }

  function updateSidebarHighlight() {
    sidebarItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.path === currentPath);
    });
  }

  // Sidebar navigation clicks
  sidebarItems.forEach((item) => {
    item.addEventListener('click', () => navigate(item.dataset.path));
  });

  // Back / Forward / Up
  backBtn.addEventListener('click', () => {
    if (historyIndex > 0) {
      historyIndex--;
      loadDirectory(history[historyIndex]);
    }
  });

  forwardBtn.addEventListener('click', () => {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      loadDirectory(history[historyIndex]);
    }
  });

  upBtn.addEventListener('click', () => {
    if (currentPath !== '/') {
      navigate(dirname(currentPath));
    }
  });

  // New Folder
  newFolderBtn.addEventListener('click', async () => {
    const name = prompt('Enter new folder name:');
    if (!name) return;
    try {
      const newPath = normalizePath(`${currentPath}/${name}`);
      await vfs.mkdir(newPath);
      notifications.show('Folder Created', name, { type: 'success' });
      loadDirectory(currentPath);
    } catch (err) {
      notifications.show('Creation Error', err.message, { type: 'error' });
    }
  });

  // Host Upload
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files);
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const target = normalizePath(`${currentPath}/${f.name}`);
          await vfs.write(target, reader.result, f.type);
          notifications.show('Uploaded', f.name, { type: 'success' });
          loadDirectory(currentPath);
        } catch (err) {
          notifications.show('Upload Error', err.message, { type: 'error' });
        }
      };
      if (f.type.startsWith('image/') || f.type.startsWith('audio/') || f.type.startsWith('video/')) {
        reader.readAsDataURL(f);
      } else {
        reader.readAsText(f);
      }
    }
    fileInput.value = '';
  });

  // Host Download / Export
  downloadBtn.addEventListener('click', async () => {
    if (selectedPaths.size === 0) {
      notifications.show('Export', 'Select a file to export to host OS', { type: 'info' });
      return;
    }
    for (const p of selectedPaths) {
      try {
        const stat = await vfs.stat(p);
        if (stat.type === 'directory') continue;
        const content = await vfs.read(p);
        const blob = new Blob([content], { type: stat.mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = stat.name;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        notifications.show('Export Error', err.message, { type: 'error' });
      }
    }
  });

  // View Toggle
  viewToggleBtn.addEventListener('click', () => {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    loadDirectory(currentPath);
  });

  // Preview Close
  previewClose.addEventListener('click', () => {
    previewModal.style.display = 'none';
    previewBody.innerHTML = '';
  });

  // Context Menu for Items (Delete, Rename, Copy, Cut, Paste)
  viewArea.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const itemEl = e.target.closest('.fe-card, tr[data-path]');
    const targetPath = itemEl ? itemEl.dataset.path : null;

    const menu = document.createElement('div');
    menu.className = 'fe-item-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    if (targetPath) {
      menu.innerHTML = `
        <div class="fe-ctx-item" data-action="open">Open</div>
        <div class="fe-ctx-item" data-action="rename">Rename</div>
        <div class="fe-ctx-item" data-action="copy">Copy</div>
        <div class="fe-ctx-item" data-action="cut">Cut</div>
        <div class="fe-ctx-item danger" data-action="delete">Delete</div>
      `;
    } else {
      menu.innerHTML = `
        <div class="fe-ctx-item" data-action="new-folder">New Folder</div>
        <div class="fe-ctx-item" data-action="paste" ${!clipboardOp ? 'style="opacity:0.4;pointer-events:none;"' : ''}>Paste</div>
        <div class="fe-ctx-item" data-action="refresh">Refresh</div>
      `;
    }

    document.body.appendChild(menu);

    const onMenuClick = async (me) => {
      const act = me.target.closest('.fe-ctx-item')?.dataset.action;
      if (!act) return;

      if (act === 'open') {
        const stat = await vfs.stat(targetPath);
        handleItemOpen(stat);
      } else if (act === 'delete') {
        if (confirm(`Delete ${basename(targetPath)}?`)) {
          await vfs.rm(targetPath, true);
          notifications.show('Deleted', basename(targetPath), { type: 'info' });
          loadDirectory(currentPath);
        }
      } else if (act === 'rename') {
        const newName = prompt('New name:', basename(targetPath));
        if (newName) {
          const dest = normalizePath(`${dirname(targetPath)}/${newName}`);
          await vfs.mv(targetPath, dest);
          loadDirectory(currentPath);
        }
      } else if (act === 'copy') {
        clipboardOp = { action: 'copy', path: targetPath };
        notifications.show('Copied to clipboard', basename(targetPath));
      } else if (act === 'cut') {
        clipboardOp = { action: 'cut', path: targetPath };
        notifications.show('Cut to clipboard', basename(targetPath));
      } else if (act === 'paste' && clipboardOp) {
        const dest = normalizePath(`${currentPath}/${basename(clipboardOp.path)}`);
        if (clipboardOp.action === 'copy') {
          await vfs.cp(clipboardOp.path, dest);
        } else {
          await vfs.mv(clipboardOp.path, dest);
          clipboardOp = null;
        }
        loadDirectory(currentPath);
      } else if (act === 'refresh') {
        loadDirectory(currentPath);
      }

      cleanupMenu();
    };

    const cleanupMenu = () => {
      menu.remove();
      document.removeEventListener('click', cleanupMenu);
    };

    menu.addEventListener('click', onMenuClick);
    setTimeout(() => document.addEventListener('click', cleanupMenu), 10);
  });

  // Auto-refresh when VFS changes
  const unsubscribeVfs = eventBus.on('vfs:changed', () => loadDirectory(currentPath));

  loadDirectory(currentPath);

  return () => {
    unsubscribeVfs();
  };
}

function _formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function _injectStyles() {
  if (document.getElementById('fe-files-styles')) return;
  const style = document.createElement('style');
  style.id = 'fe-files-styles';
  style.textContent = `
    .fe-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .fe-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--ae-bg-primary);
      border-bottom: 1px solid var(--ae-border);
    }
    .fe-nav-buttons, .fe-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .fe-btn {
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
    .fe-btn:hover {
      background: var(--ae-bg-tertiary);
      color: var(--ae-text-primary);
    }
    .fe-btn svg {
      width: 16px;
      height: 16px;
    }
    .fe-breadcrumb-bar {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius-sm);
      padding: 4px 10px;
      font-size: 12px;
      overflow-x: auto;
    }
    .fe-crumb {
      cursor: pointer;
      color: var(--ae-text-secondary);
    }
    .fe-crumb:hover {
      color: var(--ae-accent);
    }
    .fe-crumb-sep {
      color: var(--ae-text-muted);
      font-size: 10px;
    }
    .fe-separator {
      width: 1px;
      height: 20px;
      background: var(--ae-border);
      margin: 0 4px;
    }
    .fe-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .fe-sidebar {
      width: 180px;
      background: rgba(15, 15, 25, 0.7);
      border-right: 1px solid var(--ae-border);
      padding: 12px 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }
    .fe-sidebar-group-title {
      font-size: 10px;
      font-weight: 600;
      color: var(--ae-text-muted);
      padding: 4px 10px;
      letter-spacing: 0.5px;
    }
    .fe-sidebar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--ae-text-secondary);
      cursor: pointer;
      user-select: none;
    }
    .fe-sidebar-item:hover {
      background: var(--ae-bg-tertiary);
      color: var(--ae-text-primary);
    }
    .fe-sidebar-item.active {
      background: var(--ae-accent-glow);
      color: var(--ae-accent);
      font-weight: 500;
    }
    .fe-sidebar-item svg {
      width: 15px;
      height: 15px;
    }
    .fe-view-area {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .fe-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 12px;
    }
    .fe-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 10px 6px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      text-align: center;
      border: 1px solid transparent;
    }
    .fe-card:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .fe-card.selected {
      background: var(--ae-accent-glow);
      border-color: var(--ae-accent);
    }
    .fe-card-icon {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .fe-icon-folder {
      color: var(--ae-accent);
      width: 36px;
      height: 36px;
    }
    .fe-icon-file {
      color: var(--ae-text-secondary);
      width: 34px;
      height: 34px;
    }
    .fe-card-name {
      font-size: 11px;
      color: var(--ae-text-primary);
      word-break: break-all;
      max-width: 80px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .fe-list-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .fe-list-table th, .fe-list-table td {
      padding: 8px 12px;
      text-align: left;
    }
    .fe-list-table th {
      color: var(--ae-text-muted);
      border-bottom: 1px solid var(--ae-border);
      font-weight: 500;
    }
    .fe-list-table tr:hover {
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }
    .fe-list-table tr.selected {
      background: var(--ae-accent-glow);
    }
    .fe-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--ae-text-muted);
      font-size: 13px;
    }
    .fe-statusbar {
      display: flex;
      justify-content: space-between;
      padding: 4px 12px;
      background: var(--ae-bg-primary);
      border-top: 1px solid var(--ae-border);
      font-size: 11px;
      color: var(--ae-text-secondary);
    }
    .fe-preview-modal {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(12px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .fe-preview-card {
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius);
      padding: 16px;
      max-width: 80%;
      max-height: 80%;
      display: flex;
      flex-direction: column;
    }
    .fe-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .fe-preview-close {
      background: none;
      border: none;
      color: var(--ae-text-secondary);
      font-size: 18px;
      cursor: pointer;
    }
    .fe-item-context-menu {
      position: fixed;
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: 6px;
      box-shadow: var(--ae-shadow-lg);
      padding: 4px 0;
      z-index: 10000;
      min-width: 140px;
    }
    .fe-ctx-item {
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      color: var(--ae-text-primary);
    }
    .fe-ctx-item:hover {
      background: var(--ae-accent-glow);
    }
    .fe-ctx-item.danger {
      color: var(--ae-danger);
    }
  `;
  document.head.appendChild(style);
}
