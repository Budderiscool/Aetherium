// kernel/ipc.js — Event Bus, Process Registry, Notifications, Clipboard
// Aetherium OS — IPC Module

/**
 * EventBus — Map-based publish/subscribe messaging system.
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   * @param {string} channel
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  on(channel, handler) {
    if (!this._listeners.has(channel)) {
      this._listeners.set(channel, new Set());
    }
    this._listeners.get(channel).add(handler);
    return () => this.off(channel, handler);
  }

  /**
   * Unsubscribe a handler from a channel.
   * @param {string} channel
   * @param {Function} handler
   */
  off(channel, handler) {
    const handlers = this._listeners.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._listeners.delete(channel);
      }
    }
  }

  /**
   * Publish to all listeners on a channel.
   * @param {string} channel
   * @param  {...any} args
   */
  emit(channel, ...args) {
    const handlers = this._listeners.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (err) {
          console.error(`[IPC] Error in handler for "${channel}":`, err);
        }
      }
    }
  }

  /**
   * Subscribe for a single emission, then auto-unsubscribe.
   * @param {string} channel
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  once(channel, handler) {
    const wrapper = (...args) => {
      this.off(channel, wrapper);
      handler(...args);
    };
    return this.on(channel, wrapper);
  }
}

/**
 * ProcessRegistry — Tracks running processes (windows/apps).
 */
export class ProcessRegistry {
  constructor() {
    this._processes = new Map();
    this._counter = 0;
  }

  /**
   * Register a new process.
   * @param {string} pid
   * @param {{ title: string, appId: string, icon: string, windowId: string, startTime: number }} info
   */
  register(pid, info) {
    this._processes.set(pid, {
      ...info,
      pid,
      startTime: info.startTime || Date.now()
    });
  }

  /**
   * Unregister a process by PID.
   * @param {string} pid
   */
  unregister(pid) {
    this._processes.delete(pid);
  }

  /**
   * Get all registered processes.
   * @returns {Map<string, object>}
   */
  getAll() {
    return new Map(this._processes);
  }

  /**
   * Get a single process by PID.
   * @param {string} pid
   * @returns {object|undefined}
   */
  get(pid) {
    return this._processes.get(pid);
  }

  /**
   * Kill a process: emit event, then unregister.
   * @param {string} pid
   */
  kill(pid) {
    eventBus.emit('process:kill', pid);
    this.unregister(pid);
  }

  /**
   * Generate a unique process ID.
   * @returns {string} e.g. 'p-1-a3f2'
   */
  generatePid() {
    this._counter++;
    const hex = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');
    return `p-${this._counter}-${hex}`;
  }
}

/**
 * NotificationService — Toast notification system.
 */
export class NotificationService {
  constructor() {
    this._container = null;
  }

  /**
   * Get or create the notification container element.
   * @returns {HTMLElement}
   */
  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('ae-notification-container');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'ae-notification-container';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  }

  /**
   * Show a toast notification.
   * @param {string} title
   * @param {string} body
   * @param {object} [options]
   * @param {string} [options.icon] — SVG string for the icon
   * @param {number} [options.duration=4000] — Auto-dismiss time in ms
   * @param {'info'|'success'|'warning'|'error'} [options.type='info']
   * @param {Function} [options.onClick] — Click handler for the toast body
   */
  show(title, body, options = {}) {
    const {
      icon = null,
      duration = 4000,
      type = 'info',
      onClick = null
    } = options;

    const container = this._getContainer();

    const toast = document.createElement('div');
    toast.className = `ae-toast ae-toast-${type}`;

    const accentColors = {
      info: 'var(--ae-accent, #00d4ff)',
      success: 'var(--ae-success, #22c55e)',
      warning: 'var(--ae-warning, #f59e0b)',
      error: 'var(--ae-danger, #ef4444)'
    };

    const defaultIcons = {
      info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };

    const accentColor = accentColors[type] || accentColors.info;
    const iconSvg = icon || defaultIcons[type] || defaultIcons.info;

    toast.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--ae-bg-primary, rgba(15, 15, 25, 0.85));
      backdrop-filter: blur(var(--ae-blur, 18px));
      -webkit-backdrop-filter: blur(var(--ae-blur, 18px));
      border: 1px solid var(--ae-border, rgba(255, 255, 255, 0.08));
      border-left: 3px solid ${accentColor};
      border-radius: var(--ae-radius-sm, 8px);
      box-shadow: var(--ae-shadow-lg, 0 16px 48px rgba(0, 0, 0, 0.6));
      color: var(--ae-text-primary, #e8e8f0);
      font-family: var(--ae-font-ui, 'Inter', system-ui, sans-serif);
      min-width: 300px;
      max-width: 400px;
      pointer-events: auto;
      animation: ae-toast-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      position: relative;
      cursor: ${onClick ? 'pointer' : 'default'};
    `;

    const iconEl = document.createElement('div');
    iconEl.className = 'ae-toast-icon';
    iconEl.style.cssText = `
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      color: ${accentColor};
    `;
    iconEl.innerHTML = iconSvg;

    const textWrap = document.createElement('div');
    textWrap.className = 'ae-toast-text';
    textWrap.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    const titleEl = document.createElement('div');
    titleEl.className = 'ae-toast-title';
    titleEl.style.cssText = `
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 2px;
      line-height: 1.4;
    `;
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'ae-toast-body';
    bodyEl.style.cssText = `
      font-size: 12px;
      color: var(--ae-text-secondary, #a0a0b8);
      line-height: 1.4;
    `;
    bodyEl.textContent = body;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ae-toast-close';
    closeBtn.style.cssText = `
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--ae-text-muted, #606078);
      cursor: pointer;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    `;
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = 'var(--ae-text-primary, #e8e8f0)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = 'var(--ae-text-muted, #606078)';
    });

    textWrap.appendChild(titleEl);
    textWrap.appendChild(bodyEl);
    toast.appendChild(iconEl);
    toast.appendChild(textWrap);
    toast.appendChild(closeBtn);

    if (onClick) {
      toast.addEventListener('click', (e) => {
        if (e.target !== closeBtn && !closeBtn.contains(e.target)) {
          onClick();
        }
      });
    }

    const removeToast = () => {
      toast.style.animation = 'ae-toast-out 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
      toast.addEventListener('animationend', () => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, { once: true });
    };

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeToast();
    });

    container.appendChild(toast);

    const autoTimer = setTimeout(removeToast, duration);

    toast.addEventListener('mouseenter', () => {
      clearTimeout(autoTimer);
    });

    toast.addEventListener('mouseleave', () => {
      setTimeout(removeToast, 1500);
    });

    this._ensureStyles();

    eventBus.emit('notification:show', { title, body, options });
  }

  /**
   * Inject toast animation styles if not already present.
   */
  _ensureStyles() {
    if (document.getElementById('ae-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'ae-toast-styles';
    style.textContent = `
      #ae-notification-container {
        position: fixed;
        top: 44px;
        right: 16px;
        z-index: 10001;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      @keyframes ae-toast-in {
        from {
          transform: translateX(100%) scale(0.95);
          opacity: 0;
        }
        to {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
      }
      @keyframes ae-toast-out {
        from {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
        to {
          transform: translateX(100%) scale(0.95);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * ClipboardService — Internal clipboard with navigator.clipboard fallback.
 */
export class ClipboardService {
  constructor() {
    this._data = null;
    this._mime = 'text/plain';
  }

  /**
   * Copy data to the internal clipboard and optionally navigator.clipboard.
   * @param {string|ArrayBuffer} data
   * @param {string} [mime='text/plain']
   */
  async copy(data, mime = 'text/plain') {
    this._data = data;
    this._mime = mime;
    if (typeof data === 'string' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(data);
      } catch (err) {
        console.warn('[Clipboard] navigator.clipboard.writeText failed:', err);
      }
    }
  }

  /**
   * Paste from clipboard. Tries navigator.clipboard first, falls back to internal.
   * @returns {Promise<{ data: string|ArrayBuffer|null, mime: string }>}
   */
  async paste() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          return { data: text, mime: 'text/plain' };
        }
      } catch (err) {
        console.warn('[Clipboard] navigator.clipboard.readText failed:', err);
      }
    }
    return { data: this._data, mime: this._mime };
  }
}

// Singleton instances
export const eventBus = new EventBus();
export const processRegistry = new ProcessRegistry();
export const notifications = new NotificationService();
export const clipboard = new ClipboardService();
