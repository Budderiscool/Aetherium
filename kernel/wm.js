// kernel/wm.js — Hardware-Accelerated Window Compositor & Virtual Workspace Manager
// Aetherium OS — Window Subsystem

import { eventBus, processRegistry } from './ipc.js';

let windowCounter = 100;
let zIndexCounter = 100;

/**
 * WindowManager handles window lifecycle, hardware-accelerated dragging,
 * 8-directional resizing, edge-snapping, and virtual workspaces.
 */
export class WindowManager {
  constructor() {
    this.windows = new Map(); // windowId -> { id, appId, title, el, x, y, width, height, isMaximized, isMinimized, workspace, pid, cleanup }
    this.workspaces = [
      { name: 'Desktop 1', index: 0, active: true },
      { name: 'Desktop 2', index: 1, active: false }
    ];
    this.currentWorkspace = 0;
    this.activeWindowId = null;

    // Cascade coordinates
    this.cascadeX = 60;
    this.cascadeY = 40;

    // DOM references
    this.container = null;
    this.snapOverlay = null;
    this.snapLeftZone = null;
    this.snapRightZone = null;
    this.snapTopZone = null;
    this.activeAppTitleEl = null;
  }

  /**
   * Initializes DOM container hooks and global interaction listeners.
   */
  init() {
    this.container = document.getElementById('ae-window-container');
    this.snapOverlay = document.getElementById('ae-snap-overlay');
    this.activeAppTitleEl = document.getElementById('ae-active-app-title');

    if (this.snapOverlay) {
      this.snapLeftZone = this.snapOverlay.querySelector('.ae-snap-left');
      this.snapRightZone = this.snapOverlay.querySelector('.ae-snap-right');
      this.snapTopZone = this.snapOverlay.querySelector('.ae-snap-top');
    }

    // Process kill listener from task manager or terminal
    eventBus.on('process:kill', (pid) => {
      for (const [winId, win] of this.windows.entries()) {
        if (win.pid === pid) {
          this.closeWindow(winId);
          break;
        }
      }
    });

    this.renderWorkspaceSwitcher();
  }

  /**
   * Creates and mounts an application window.
   * @param {Object} options
   * @returns {string} windowId
   */
  createWindow(options = {}) {
    const windowId = `win-${++windowCounter}`;
    const appId = options.appId || 'app';
    const title = options.title || 'Application';
    const icon = options.icon || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
    
    // Bounds calculation
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = Math.min(options.width || 800, viewportW - 40);
    const height = Math.min(options.height || 560, viewportH - 120);
    const minWidth = options.minWidth || 360;
    const minHeight = options.minHeight || 240;

    // Positioning
    let x = options.x !== undefined ? options.x : this.cascadeX;
    let y = options.y !== undefined ? options.y : this.cascadeY;

    // Update cascade offsets
    this.cascadeX = (this.cascadeX + 28) % (Math.max(100, viewportW - width - 80));
    this.cascadeY = 40 + ((this.cascadeY + 24) % Math.max(80, viewportH - height - 120));

    // Construct Window DOM element
    const winEl = document.createElement('div');
    winEl.className = 'ae-window';
    winEl.id = windowId;
    winEl.dataset.workspace = this.currentWorkspace.toString();
    winEl.style.width = `${width}px`;
    winEl.style.height = `${height}px`;
    winEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    winEl.dataset.x = x.toString();
    winEl.dataset.y = y.toString();
    winEl.dataset.w = width.toString();
    winEl.dataset.h = height.toString();

    winEl.innerHTML = `
      <div class="ae-window-titlebar">
        <span class="ae-window-icon">${icon}</span>
        <span class="ae-window-title">${title}</span>
        <div class="ae-window-controls">
          <button class="ae-window-btn minimize" title="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="ae-window-btn maximize" title="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </button>
          <button class="ae-window-btn close" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="ae-window-content"></div>
      ${options.resizable !== false ? `
        <div class="ae-window-resize" data-dir="n"></div>
        <div class="ae-window-resize" data-dir="s"></div>
        <div class="ae-window-resize" data-dir="e"></div>
        <div class="ae-window-resize" data-dir="w"></div>
        <div class="ae-window-resize" data-dir="ne"></div>
        <div class="ae-window-resize" data-dir="nw"></div>
        <div class="ae-window-resize" data-dir="se"></div>
        <div class="ae-window-resize" data-dir="sw"></div>
      ` : ''}
    `;

    // Process Registration
    const pid = processRegistry.register(processRegistry.generatePid(), {
      title,
      appId,
      icon,
      windowId,
      startTime: Date.now()
    });

    const contentEl = winEl.querySelector('.ae-window-content');
    let cleanupFn = null;
    if (typeof options.content === 'function') {
      cleanupFn = options.content(contentEl);
    }

    const winData = {
      id: windowId,
      appId,
      title,
      icon,
      el: winEl,
      x,
      y,
      width,
      height,
      minWidth,
      minHeight,
      isMaximized: false,
      isMinimized: false,
      workspace: this.currentWorkspace,
      pid,
      cleanup: cleanupFn
    };

    this.windows.set(windowId, winData);
    this.container.appendChild(winEl);

    // Event Bindings
    this._attachWindowInteractions(winData);

    // Focus immediately
    this.focusWindow(windowId);

    eventBus.emit('window:opened', { windowId, appId, pid, title });
    return windowId;
  }

  /**
   * Attaches window dragging, resizing, button controls and focus listeners.
   * @private
   */
  _attachWindowInteractions(win) {
    const el = win.el;
    const titlebar = el.querySelector('.ae-window-titlebar');
    const minBtn = el.querySelector('.ae-window-btn.minimize');
    const maxBtn = el.querySelector('.ae-window-btn.maximize');
    const closeBtn = el.querySelector('.ae-window-btn.close');

    // Focus on mousedown
    el.addEventListener('mousedown', () => this.focusWindow(win.id));

    // Controls
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeWindow(win.id);
    });

    maxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.maximizeWindow(win.id);
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(win.id);
    });

    // Double-click titlebar to toggle maximize
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.ae-window-controls')) return;
      this.maximizeWindow(win.id);
    });

    // 1. Hardware-Accelerated Dragging with Snap Zones
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ae-window-controls')) return;
      if (win.isMaximized) {
        // If dragging maximized window, restore first and position under cursor
        const restoreW = parseInt(el.dataset.w || '800', 10);
        this.maximizeWindow(win.id);
        win.x = Math.max(0, e.clientX - restoreW / 2);
        win.y = 40;
        el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
      }

      this.focusWindow(win.id);
      
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startX = win.x;
      const startY = win.y;
      let activeSnapType = null;

      const onMouseMove = (moveEv) => {
        const dx = moveEv.clientX - startMouseX;
        const dy = moveEv.clientY - startMouseY;
        const newX = startX + dx;
        const newY = Math.max(0, startY + dy);

        win.x = newX;
        win.y = newY;
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
        el.dataset.x = newX.toString();
        el.dataset.y = newY.toString();

        // Check Snap Detection
        if (this.snapOverlay) {
          const edgeThreshold = 24;
          const topThreshold = 14;

          this.snapLeftZone?.classList.remove('active');
          this.snapRightZone?.classList.remove('active');
          this.snapTopZone?.classList.remove('active');

          if (moveEv.clientX < edgeThreshold) {
            this.snapOverlay.classList.add('visible');
            this.snapLeftZone?.classList.add('active');
            activeSnapType = 'left';
          } else if (moveEv.clientX > window.innerWidth - edgeThreshold) {
            this.snapOverlay.classList.add('visible');
            this.snapRightZone?.classList.add('active');
            activeSnapType = 'right';
          } else if (moveEv.clientY < topThreshold) {
            this.snapOverlay.classList.add('visible');
            this.snapTopZone?.classList.add('active');
            activeSnapType = 'top';
          } else {
            this.snapOverlay.classList.remove('visible');
            activeSnapType = null;
          }
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (this.snapOverlay) {
          this.snapOverlay.classList.remove('visible');
          this.snapLeftZone?.classList.remove('active');
          this.snapRightZone?.classList.remove('active');
          this.snapTopZone?.classList.remove('active');
        }

        // Apply Snap if dropped in zone
        if (activeSnapType === 'left') {
          this.snapWindow(win.id, 'left');
        } else if (activeSnapType === 'right') {
          this.snapWindow(win.id, 'right');
        } else if (activeSnapType === 'top') {
          this.maximizeWindow(win.id);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // 2. 8-Directional Edge/Corner Resizing
    const resizeHandles = el.querySelectorAll('.ae-window-resize');
    resizeHandles.forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.focusWindow(win.id);

        if (win.isMaximized) return;

        const dir = handle.dataset.dir;
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startW = win.width;
        const startH = win.height;
        const startX = win.x;
        const startY = win.y;

        const onResizeMove = (moveEv) => {
          const dx = moveEv.clientX - startMouseX;
          const dy = moveEv.clientY - startMouseY;
          let newW = startW;
          let newH = startH;
          let newX = startX;
          let newY = startY;

          if (dir.includes('e')) newW = Math.max(win.minWidth, startW + dx);
          if (dir.includes('s')) newH = Math.max(win.minHeight, startH + dy);

          if (dir.includes('w')) {
            const potentialW = startW - dx;
            if (potentialW >= win.minWidth) {
              newW = potentialW;
              newX = startX + dx;
            } else {
              newW = win.minWidth;
              newX = startX + (startW - win.minWidth);
            }
          }

          if (dir.includes('n')) {
            const potentialH = startH - dy;
            if (potentialH >= win.minHeight) {
              newH = potentialH;
              newY = startY + dy;
            } else {
              newH = win.minHeight;
              newY = startY + (startH - win.minHeight);
            }
          }

          win.width = newW;
          win.height = newH;
          win.x = newX;
          win.y = newY;

          el.style.width = `${newW}px`;
          el.style.height = `${newH}px`;
          el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
          el.dataset.w = newW.toString();
          el.dataset.h = newH.toString();
          el.dataset.x = newX.toString();
          el.dataset.y = newY.toString();
        };

        const onResizeUp = () => {
          window.removeEventListener('mousemove', onResizeMove);
          window.removeEventListener('mouseup', onResizeUp);
        };

        window.addEventListener('mousemove', onResizeMove);
        window.addEventListener('mouseup', onResizeUp);
      });
    });
  }

  /**
   * Snaps a window to split zones.
   */
  snapWindow(windowId, side) {
    const win = this.windows.get(windowId);
    if (!win) return;

    win.el.classList.remove('maximized', 'snapped-left', 'snapped-right');
    if (side === 'left') {
      win.el.classList.add('snapped-left');
    } else if (side === 'right') {
      win.el.classList.add('snapped-right');
    }
    this.focusWindow(windowId);
  }

  /**
   * Focuses and raises a window to the top z-index.
   * @param {string} windowId
   */
  focusWindow(windowId) {
    const win = this.windows.get(windowId);
    if (!win) return;

    if (win.isMinimized) {
      this.restoreWindow(windowId);
    }

    zIndexCounter++;
    win.el.style.zIndex = zIndexCounter.toString();

    // Clear focused state on other windows
    for (const other of this.windows.values()) {
      other.el.classList.remove('focused');
    }
    win.el.classList.add('focused');
    this.activeWindowId = windowId;

    if (this.activeAppTitleEl) {
      this.activeAppTitleEl.textContent = win.title;
    }

    eventBus.emit('window:focused', { windowId, appId: win.appId });
  }

  /**
   * Minimizes a window.
   */
  minimizeWindow(windowId) {
    const win = this.windows.get(windowId);
    if (!win) return;

    win.isMinimized = true;
    win.el.classList.add('minimized');

    // Focus next available window on this workspace
    this._focusNextWindow();
    eventBus.emit('window:minimized', { windowId });
  }

  /**
   * Restores a minimized window.
   */
  restoreWindow(windowId) {
    const win = this.windows.get(windowId);
    if (!win) return;

    win.isMinimized = false;
    win.el.classList.remove('minimized');
    this.focusWindow(windowId);
  }

  /**
   * Toggles maximization state.
   */
  maximizeWindow(windowId) {
    const win = this.windows.get(windowId);
    if (!win) return;

    win.el.classList.remove('snapped-left', 'snapped-right');

    if (win.isMaximized) {
      win.isMaximized = false;
      win.el.classList.remove('maximized');
      win.el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
      win.el.style.width = `${win.width}px`;
      win.el.style.height = `${win.height}px`;
    } else {
      win.isMaximized = true;
      win.el.classList.add('maximized');
      win.el.style.transform = '';
    }
  }

  /**
   * Closes and cleans up a window.
   */
  closeWindow(windowId) {
    const win = this.windows.get(windowId);
    if (!win) return;

    if (typeof win.cleanup === 'function') {
      try {
        win.cleanup();
      } catch (err) {
        console.warn('[WM] App cleanup error:', err);
      }
    }

    win.el.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
    win.el.style.transform = 'scale(0.92)';
    win.el.style.opacity = '0';

    setTimeout(() => {
      if (win.el.parentNode) {
        win.el.parentNode.removeChild(win.el);
      }
      processRegistry.unregister(win.pid);
      this.windows.delete(windowId);
      this._focusNextWindow();
      eventBus.emit('window:closed', { windowId, appId: win.appId });
    }, 180);
  }

  /**
   * Changes the active window title.
   */
  setTitle(windowId, title) {
    const win = this.windows.get(windowId);
    if (!win) return;
    win.title = title;
    const titleSpan = win.el.querySelector('.ae-window-title');
    if (titleSpan) titleSpan.textContent = title;
    if (this.activeWindowId === windowId && this.activeAppTitleEl) {
      this.activeAppTitleEl.textContent = title;
    }
  }

  /**
   * Internal helper to focus the next available window on current workspace.
   * @private
   */
  _focusNextWindow() {
    let topWin = null;
    let maxZ = -1;

    for (const win of this.windows.values()) {
      if (!win.isMinimized && win.workspace === this.currentWorkspace) {
        const z = parseInt(win.el.style.zIndex || '0', 10);
        if (z > maxZ) {
          maxZ = z;
          topWin = win;
        }
      }
    }

    if (topWin) {
      this.focusWindow(topWin.id);
    } else {
      this.activeWindowId = null;
      if (this.activeAppTitleEl) {
        this.activeAppTitleEl.textContent = 'Desktop';
      }
    }
  }

  // ============================================================
  // Virtual Workspaces Implementation
  // ============================================================

  /**
   * Switches to a specific workspace index.
   * @param {number} index
   */
  switchWorkspace(index) {
    if (index < 0 || index >= this.workspaces.length) return;
    this.currentWorkspace = index;

    for (const ws of this.workspaces) {
      ws.active = ws.index === index;
    }

    // Toggle window visibility per workspace
    for (const win of this.windows.values()) {
      if (win.workspace === index) {
        if (!win.isMinimized) {
          win.el.style.display = 'flex';
        }
      } else {
        win.el.style.display = 'none';
      }
    }

    this.renderWorkspaceSwitcher();
    this._focusNextWindow();
    eventBus.emit('workspace:switched', index);
  }

  /**
   * Creates a new workspace up to a limit of 6.
   * @param {string} [name]
   * @returns {number} new index
   */
  createWorkspace(name) {
    if (this.workspaces.length >= 6) return this.currentWorkspace;
    const nextIndex = this.workspaces.length;
    const wsName = name || `Desktop ${nextIndex + 1}`;
    this.workspaces.push({ name: wsName, index: nextIndex, active: false });
    this.renderWorkspaceSwitcher();
    return nextIndex;
  }

  /**
   * Renders the workspace indicators in the topbar.
   */
  renderWorkspaceSwitcher() {
    const switcher = document.getElementById('ae-workspace-switcher');
    if (!switcher) return;

    switcher.innerHTML = '';
    this.workspaces.forEach((ws) => {
      const btn = document.createElement('button');
      btn.className = `ae-workspace-btn ${ws.active ? 'active' : ''}`;
      btn.title = ws.name;
      btn.addEventListener('click', () => this.switchWorkspace(ws.index));
      switcher.appendChild(btn);
    });

    if (this.workspaces.length < 6) {
      const addBtn = document.createElement('button');
      addBtn.className = 'ae-workspace-btn';
      addBtn.style.width = '12px';
      addBtn.title = 'Add Workspace';
      addBtn.style.opacity = '0.5';
      addBtn.addEventListener('click', () => {
        const idx = this.createWorkspace();
        this.switchWorkspace(idx);
      });
      switcher.appendChild(addBtn);
    }
  }

  getActiveWindow() {
    return this.activeWindowId;
  }

  getWindows() {
    return this.windows;
  }

  getWorkspaces() {
    return this.workspaces;
  }

  getCurrentWorkspace() {
    return this.currentWorkspace;
  }
}

// Singleton export
export const wm = new WindowManager();
