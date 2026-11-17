// kernel/vfs.js — Asynchronous POSIX-Style IndexedDB Virtual File System Engine
// Aetherium OS — Storage Subsystem

import { eventBus } from './ipc.js';

const DB_NAME = 'AetheriumVFS';
const DB_VERSION = 1;
const STORE_NAME = 'files';

/**
 * Normalizes a virtual path to start with '/' and strip duplicate or trailing slashes.
 * @param {string} p
 * @returns {string}
 */
export function normalizePath(p) {
  if (!p || typeof p !== 'string') return '/';
  let clean = p.trim().replace(/\\/g, '/');
  if (!clean.startsWith('/')) clean = '/' + clean;
  // Collapse duplicate slashes and remove trailing slash (except root)
  clean = clean.replace(/\/+/g, '/');
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

/**
 * Extracts the parent directory path.
 * @param {string} p
 * @returns {string}
 */
export function dirname(p) {
  const norm = normalizePath(p);
  if (norm === '/') return '/';
  const lastSlash = norm.lastIndexOf('/');
  if (lastSlash === 0) return '/';
  return norm.substring(0, lastSlash);
}

/**
 * Extracts the filename/basename from a path.
 * @param {string} p
 * @returns {string}
 */
export function basename(p) {
  const norm = normalizePath(p);
  if (norm === '/') return '';
  const lastSlash = norm.lastIndexOf('/');
  return norm.substring(lastSlash + 1);
}

/**
 * Maps common file extensions to standard MIME types.
 * @param {string} filename
 * @returns {string}
 */
export function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

/**
 * VirtualFileSystem — Complete client-side POSIX-style filesystem built on IndexedDB.
 */
export class VirtualFileSystem {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the IndexedDB store and populates default OS directory structure.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isInitialized && this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('parent', 'parent', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        this.isInitialized = true;
        try {
          await this._ensureDefaultStructure();
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      request.onerror = (event) => {
        console.error('[VFS] IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Creates the default directory tree and default files if not existing.
   * @private
   */
  async _ensureDefaultStructure() {
    const defaultDirs = [
      '/',
      '/home',
      '/home/user',
      '/home/user/Desktop',
      '/home/user/Documents',
      '/home/user/Documents/notes',
      '/home/user/Downloads',
      '/home/user/Pictures',
      '/home/user/Music',
      '/system',
      '/system/apps',
      '/system/config',
      '/system/wallpapers',
      '/tmp'
    ];

    for (const dir of defaultDirs) {
      if (!(await this.exists(dir))) {
        await this._rawPut({
          path: dir,
          name: dir === '/' ? '/' : basename(dir),
          parent: dirname(dir),
          type: 'directory',
          size: 0,
          created: Date.now(),
          modified: Date.now()
        });
      }
    }

    // Default README on Desktop
    const readmePath = '/home/user/Desktop/README.txt';
    if (!(await this.exists(readmePath))) {
      const readmeText = `=====================================================
            WELCOME TO AETHERIUM OS (v1.0.0)
   Modular, Client-Side Browser Operating System
=====================================================

Aetherium is a high-performance operating system designed
to execute 100% inside your web browser and deploy statically
on GitHub Pages.

Key Features & Architectural Highlights:
-----------------------------------------------------
1. POSIX Virtual File System: Fully asynchronous, IndexedDB-
   backed storage with automatic schema initialization.
2. Window Compositor: Hardware-accelerated translate3d window
   stacking, 8-directional edge resizing, and window snapping.
3. Virtual Workspaces: Multiple isolated desktop workspaces
   accessible via the top status bar.
4. AetherNet Proxy Browser: Integrated client-side Service Worker
   proxy architecture supporting Bare/Wisp transports.
5. System Terminal (AetherShell): Connected directly to the VFS
   with command history, neofetch, and piped redirection.
6. Developer Code Editor: Built-in code editor with syntax
   highlighting and live HTML execution.

Shortcuts:
- Alt + Space: Trigger Spotlight Global Search
- Double click icons: Launch associated applications
- Right-click Desktop: Open Context Menu

Visit System Settings to customize themes, wallpapers, and proxy endpoints!
`;
      await this.write(readmePath, readmeText, 'text/plain');
    }

    // Default Bookmarks in Documents
    const bookmarksPath = '/home/user/Documents/bookmarks.json';
    if (!(await this.exists(bookmarksPath))) {
      const defaultBookmarks = {
        bookmarks: [
          { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
          { title: 'GitHub', url: 'https://github.com' },
          { title: 'Wikipedia', url: 'https://wikipedia.org' },
          { title: 'Hacker News', url: 'https://news.ycombinator.com' }
        ]
      };
      await this.write(bookmarksPath, JSON.stringify(defaultBookmarks, null, 2), 'application/json');
    }

    // Default Users in /system/config
    const usersPath = '/system/config/users.json';
    if (!(await this.exists(usersPath))) {
      const defaultUsers = {
        users: [{ username: 'Aether Administrator', password: '', role: 'admin', created: Date.now() }],
        activeUser: 'Aether Administrator'
      };
      await this.write(usersPath, JSON.stringify(defaultUsers, null, 2), 'application/json');
    }

    // Default Preferences in /system/config
    const prefsPath = '/system/config/preferences.json';
    if (!(await this.exists(prefsPath))) {
      const defaultPrefs = {
        theme: 'dark',
        wallpaper: 'deep-space',
        accentColor: '#00d4ff',
        proxyTransportUrl: 'https://bare.benroberts.net/',
        proxyTransportType: 'bare',
        dockPinned: ['files', 'terminal', 'editor', 'browser', 'monitor', 'settings']
      };
      await this.write(prefsPath, JSON.stringify(defaultPrefs, null, 2), 'application/json');
    }

    // Default Sample Files
    const sampleMdPath = '/home/user/Desktop/Welcome.md';
    if (!(await this.exists(sampleMdPath))) {
      const sampleMd = `# Welcome to Aetherium OS

Aetherium is a high-performance, browser-based operating system built with:
- **100% Client-Side ES6+ Modules**: Runs statically on GitHub Pages.
- **Asynchronous IndexedDB VFS**: Hierarchical POSIX file management.
- **Hardware-Accelerated Compositor**: 3D translate-based window stacking.
- **AetherNet Proxy**: Service Worker-based network proxy engine.

### Quick Shortcuts:
- **Alt + Space**: Spotlight Search
- **Ctrl + S**: Save in Code Editor
- **Double Click**: Launch files or open folders
- **Drag to Screen Edges**: Snap windows (left, right, or top maximize)
`;
      await this.write(sampleMdPath, sampleMd, 'text/markdown');
    }

    if (!(await this.exists('/home/user/Desktop/Projects'))) {
      await this.mkdir('/home/user/Desktop/Projects');
    }
  }

  /**
   * Internal helper to write an entry to IndexedDB.
   * @private
   */
  _rawPut(entry) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve(entry);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Internal helper to fetch an entry from IndexedDB.
   * @private
   */
  _rawGet(path) {
    return new Promise((resolve, reject) => {
      const norm = normalizePath(path);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(norm);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Reads a file's content.
   * @param {string} path
   * @returns {Promise<string|ArrayBuffer>}
   */
  async read(path) {
    const entry = await this._rawGet(path);
    if (!entry) {
      throw new Error(`File not found: ${path}`);
    }
    if (entry.type === 'directory') {
      throw new Error(`Cannot read directory as file: ${path}`);
    }
    return entry.content;
  }

  /**
   * Writes content to a file, automatically creating parent directories.
   * @param {string} path
   * @param {string|ArrayBuffer} content
   * @param {string} [mime]
   * @returns {Promise<void>}
   */
  async write(path, content, mime) {
    const norm = normalizePath(path);
    const parentDir = dirname(norm);
    
    // Ensure parent directories exist
    if (parentDir !== '/' && !(await this.exists(parentDir))) {
      await this.mkdir(parentDir, true);
    }

    const existing = await this._rawGet(norm);
    const resolvedMime = mime || guessMime(norm);
    
    let size = 0;
    if (typeof content === 'string') {
      size = new Blob([content]).size;
    } else if (content instanceof ArrayBuffer) {
      size = content.byteLength;
    }

    const entry = {
      path: norm,
      name: basename(norm),
      parent: parentDir,
      type: 'file',
      content: content,
      mime: resolvedMime,
      size: size,
      created: existing ? existing.created : Date.now(),
      modified: Date.now()
    };

    await this._rawPut(entry);
    eventBus.emit('vfs:changed', { path: norm, operation: 'write' });
  }

  /**
   * Appends text content to an existing or new file.
   * @param {string} path
   * @param {string} appendContent
   * @returns {Promise<void>}
   */
  async append(path, appendContent) {
    let existingContent = '';
    try {
      existingContent = await this.read(path);
    } catch {
      existingContent = '';
    }
    const newContent = existingContent + appendContent;
    await this.write(path, newContent);
  }

  /**
   * Creates a directory.
   * @param {string} path
   * @param {boolean} [recursive=false]
   * @returns {Promise<void>}
   */
  async mkdir(path, recursive = false) {
    const norm = normalizePath(path);
    if (norm === '/') return;

    if (await this.exists(norm)) {
      const stat = await this.stat(norm);
      if (stat.type === 'directory') return;
      throw new Error(`Path exists and is not a directory: ${norm}`);
    }

    const parentDir = dirname(norm);
    if (parentDir !== '/' && !(await this.exists(parentDir))) {
      if (recursive) {
        await this.mkdir(parentDir, true);
      } else {
        throw new Error(`Parent directory does not exist: ${parentDir}`);
      }
    }

    const entry = {
      path: norm,
      name: basename(norm),
      parent: parentDir,
      type: 'directory',
      size: 0,
      created: Date.now(),
      modified: Date.now()
    };

    await this._rawPut(entry);
    eventBus.emit('vfs:changed', { path: norm, operation: 'mkdir' });
  }

  /**
   * Removes a file or directory.
   * @param {string} path
   * @param {boolean} [recursive=false]
   * @returns {Promise<void>}
   */
  async rm(path, recursive = false) {
    const norm = normalizePath(path);
    if (norm === '/') {
      throw new Error('Refusing to remove root directory "/"');
    }

    const entry = await this._rawGet(norm);
    if (!entry) {
      throw new Error(`No such file or directory: ${norm}`);
    }

    if (entry.type === 'directory') {
      const children = await this.readdir(norm);
      if (children.length > 0 && !recursive) {
        throw new Error(`Directory not empty: ${norm}. Use recursive mode.`);
      }

      // If recursive, delete all entries with this prefix
      if (recursive) {
        const allEntries = await this._rawGetAll();
        const prefix = norm + '/';
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        for (const item of allEntries) {
          if (item.path.startsWith(prefix)) {
            store.delete(item.path);
          }
        }
        await new Promise((resolve) => { tx.oncomplete = resolve; });
      }
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(norm);
      req.onsuccess = () => {
        eventBus.emit('vfs:changed', { path: norm, operation: 'delete' });
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Renames or moves a file or directory.
   * @param {string} src
   * @param {string} dest
   * @returns {Promise<void>}
   */
  async mv(src, dest) {
    const normSrc = normalizePath(src);
    let normDest = normalizePath(dest);

    const srcEntry = await this._rawGet(normSrc);
    if (!srcEntry) {
      throw new Error(`Source does not exist: ${normSrc}`);
    }

    // If destination is an existing directory, move into it
    if (await this.exists(normDest)) {
      const destStat = await this.stat(normDest);
      if (destStat.type === 'directory') {
        normDest = normalizePath(normDest + '/' + srcEntry.name);
      }
    }

    if (srcEntry.type === 'file') {
      await this.write(normDest, srcEntry.content, srcEntry.mime);
      await this.rm(normSrc);
    } else {
      // Moving directory: move root and rewrite children prefixes
      const allEntries = await this._rawGetAll();
      const prefix = normSrc + '/';

      await this.mkdir(normDest, true);

      for (const item of allEntries) {
        if (item.path.startsWith(prefix)) {
          const subPath = item.path.substring(prefix.length);
          const newPath = normalizePath(normDest + '/' + subPath);
          if (item.type === 'directory') {
            await this.mkdir(newPath, true);
          } else {
            await this.write(newPath, item.content, item.mime);
          }
        }
      }
      await this.rm(normSrc, true);
    }

    eventBus.emit('vfs:changed', { path: normDest, operation: 'mv' });
  }

  /**
   * Copies a file from src to dest.
   * @param {string} src
   * @param {string} dest
   * @returns {Promise<void>}
   */
  async cp(src, dest) {
    const normSrc = normalizePath(src);
    let normDest = normalizePath(dest);

    const srcEntry = await this._rawGet(normSrc);
    if (!srcEntry) {
      throw new Error(`Source does not exist: ${normSrc}`);
    }

    if (await this.exists(normDest)) {
      const destStat = await this.stat(normDest);
      if (destStat.type === 'directory') {
        normDest = normalizePath(normDest + '/' + srcEntry.name);
      }
    }

    if (srcEntry.type === 'file') {
      await this.write(normDest, srcEntry.content, srcEntry.mime);
    } else {
      // Recursive directory copy
      const allEntries = await this._rawGetAll();
      const prefix = normSrc + '/';
      await this.mkdir(normDest, true);

      for (const item of allEntries) {
        if (item.path.startsWith(prefix)) {
          const subPath = item.path.substring(prefix.length);
          const newPath = normalizePath(normDest + '/' + subPath);
          if (item.type === 'directory') {
            await this.mkdir(newPath, true);
          } else {
            await this.write(newPath, item.content, item.mime);
          }
        }
      }
    }

    eventBus.emit('vfs:changed', { path: normDest, operation: 'cp' });
  }

  /**
   * Returns metadata/stat for a given path.
   * @param {string} path
   * @returns {Promise<{name: string, path: string, type: string, size: number, mime?: string, created: number, modified: number}>}
   */
  async stat(path) {
    const entry = await this._rawGet(path);
    if (!entry) {
      throw new Error(`No such file or directory: ${path}`);
    }
    return {
      name: entry.name,
      path: entry.path,
      parent: entry.parent,
      type: entry.type,
      size: entry.size || 0,
      mime: entry.mime || (entry.type === 'directory' ? 'inode/directory' : 'application/octet-stream'),
      created: entry.created,
      modified: entry.modified
    };
  }

  /**
   * Lists the immediate children of a directory.
   * @param {string} path
   * @returns {Promise<Array<Object>>}
   */
  async readdir(path) {
    const norm = normalizePath(path);
    const entry = await this._rawGet(norm);
    if (!entry) {
      throw new Error(`No such directory: ${norm}`);
    }
    if (entry.type !== 'directory') {
      throw new Error(`Not a directory: ${norm}`);
    }

    const all = await this._rawGetAll();
    return all
      .filter((item) => item.parent === norm && item.path !== norm)
      .map((item) => ({
        name: item.name,
        path: item.path,
        parent: item.parent,
        type: item.type,
        size: item.size || 0,
        mime: item.mime,
        created: item.created,
        modified: item.modified
      }))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Checks if a path exists.
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    const entry = await this._rawGet(path);
    return entry !== null;
  }

  /**
   * Retrieves all entries in the IndexedDB store.
   * @private
   */
  _rawGetAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Exports entire VFS as a serialized JSON string.
   * @returns {Promise<string>}
   */
  async exportBackup() {
    const all = await this._rawGetAll();
    return JSON.stringify(all, null, 2);
  }

  /**
   * Imports and restores VFS from a JSON backup string.
   * @param {string} jsonString
   * @returns {Promise<void>}
   */
  async importBackup(jsonString) {
    const entries = JSON.parse(jsonString);
    if (!Array.isArray(entries)) {
      throw new Error('Invalid backup format: root must be an array of entries');
    }

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    for (const item of entries) {
      store.put(item);
    }

    await new Promise((resolve) => { tx.oncomplete = resolve; });
    eventBus.emit('vfs:changed', { path: '/', operation: 'restore' });
  }

  /**
   * Calculates total entry count and estimated byte size.
   * @returns {Promise<{entries: number, estimatedBytes: number}>}
   */
  async getUsage() {
    const all = await this._rawGetAll();
    let totalBytes = 0;
    for (const item of all) {
      totalBytes += item.size || 0;
    }
    return {
      entries: all.length,
      estimatedBytes: totalBytes
    };
  }

  /**
   * Clears the entire database and re-initializes factory defaults.
   * @returns {Promise<void>}
   */
  async factoryReset() {
    if (this.db) {
      this.db.close();
    }
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = resolve;
      req.onerror = reject;
    });
    this.isInitialized = false;
    await this.init();
    eventBus.emit('vfs:changed', { path: '/', operation: 'reset' });
  }
}

// Singleton export
export const vfs = new VirtualFileSystem();
