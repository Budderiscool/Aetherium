// apps/notes.js — Integrated Virtual File System Notepad
// Aetherium OS — Notes Subsystem

import { vfs, normalizePath, basename } from '../kernel/vfs.js';
import { notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'notes',
  title: 'Notes',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  defaultWidth: 680,
  defaultHeight: 520,
  minWidth: 420,
  minHeight: 320,
  singleton: true,
  category: 'utility'
};

const NOTES_DIR = '/home/user/Documents/notes';

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let notes = [];
  let activeNotePath = null;
  let saveTimer = null;

  container.innerHTML = `
    <div class="nt-container">
      <!-- Sidebar -->
      <aside class="nt-sidebar">
        <div class="nt-sidebar-header">
          <input type="text" class="nt-search" placeholder="Search notes...">
          <button class="nt-btn nt-new-btn" title="Create New Note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="nt-list"></div>
      </aside>

      <!-- Main Editor -->
      <main class="nt-editor-wrap">
        <textarea class="nt-textarea" placeholder="Start typing your note here..."></textarea>
        <footer class="nt-statusbar">
          <span class="nt-counts">0 words &bull; 0 characters</span>
          <span class="nt-saved-status">Saved</span>
        </footer>
      </main>
    </div>
  `;

  const searchInput = container.querySelector('.nt-search');
  const newBtn = container.querySelector('.nt-new-btn');
  const listEl = container.querySelector('.nt-list');
  const textarea = container.querySelector('.nt-textarea');
  const countsEl = container.querySelector('.nt-counts');
  const savedStatusEl = container.querySelector('.nt-saved-status');

  async function loadNotes() {
    try {
      if (!(await vfs.exists(NOTES_DIR))) {
        await vfs.mkdir(NOTES_DIR, true);
      }
      const files = await vfs.readdir(NOTES_DIR);
      notes = [];

      for (const f of files) {
        if (f.type === 'file' && f.name.endsWith('.txt')) {
          const content = await vfs.read(f.path);
          const lines = (typeof content === 'string' ? content : '').split('\n');
          const title = lines[0]?.trim() || 'Untitled Note';
          notes.push({
            path: f.path,
            title: title,
            content: content,
            modified: f.modified
          });
        }
      }

      notes.sort((a, b) => b.modified - a.modified);

      if (notes.length === 0) {
        // Create initial note
        await createNote('Welcome Note', 'Welcome to Aetherium Notes!\n\nAll your notes are persisted automatically to the IndexedDB virtual file system at /home/user/Documents/notes.');
      } else {
        renderNotesList();
        selectNote(notes[0].path);
      }
    } catch (err) {
      console.warn('[Notes] Error loading notes:', err);
    }
  }

  function renderNotesList(filterText = '') {
    listEl.innerHTML = '';
    const filtered = notes.filter((n) => n.title.toLowerCase().includes(filterText.toLowerCase()) || n.content.toLowerCase().includes(filterText.toLowerCase()));

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="nt-empty">No notes found</div>`;
      return;
    }

    filtered.forEach((n) => {
      const item = document.createElement('div');
      item.className = `nt-item ${n.path === activeNotePath ? 'active' : ''}`;
      const snippet = n.content.split('\n').slice(1).join(' ').trim() || 'No additional text';

      item.innerHTML = `
        <div class="nt-item-body">
          <div class="nt-item-title">${n.title}</div>
          <div class="nt-item-preview">${snippet}</div>
        </div>
        <button class="nt-item-del" title="Delete Note">&times;</button>
      `;

      item.addEventListener('click', () => selectNote(n.path));
      item.querySelector('.nt-item-del').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(n.path);
      });

      listEl.appendChild(item);
    });
  }

  async function createNote(initialTitle = 'New Note', initialContent = '') {
    const filename = `note-${Date.now()}.txt`;
    const fullPath = normalizePath(`${NOTES_DIR}/${filename}`);
    const body = initialContent || initialTitle + '\n\n';
    await vfs.write(fullPath, body);
    await loadNotes();
    selectNote(fullPath);
  }

  function selectNote(path) {
    activeNotePath = path;
    const note = notes.find((n) => n.path === path);
    if (!note) return;

    textarea.value = note.content;
    updateCounts();
    savedStatusEl.textContent = 'Saved';
    renderNotesList(searchInput.value);
    wm.setTitle(windowId, `Notes — ${note.title}`);
  }

  async function deleteNote(path) {
    if (confirm('Delete this note permanently?')) {
      await vfs.rm(path);
      await loadNotes();
    }
  }

  function updateCounts() {
    const val = textarea.value;
    const chars = val.length;
    const words = val.trim() ? val.trim().split(/\s+/).length : 0;
    countsEl.textContent = `${words} words • ${chars} characters`;
  }

  textarea.addEventListener('input', () => {
    updateCounts();
    savedStatusEl.textContent = 'Unsaved changes...';

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (activeNotePath) {
        const content = textarea.value;
        await vfs.write(activeNotePath, content);
        const lines = content.split('\n');
        const note = notes.find((n) => n.path === activeNotePath);
        if (note) {
          note.title = lines[0]?.trim() || 'Untitled Note';
          note.content = content;
          note.modified = Date.now();
        }
        savedStatusEl.textContent = 'Saved to VFS';
        renderNotesList(searchInput.value);
      }
    }, 600);
  });

  searchInput.addEventListener('input', () => renderNotesList(searchInput.value));
  newBtn.addEventListener('click', () => createNote('Untitled Note'));

  loadNotes();

  return () => {
    if (saveTimer) clearTimeout(saveTimer);
  };
}

function _injectStyles() {
  if (document.getElementById('nt-notes-styles')) return;
  const style = document.createElement('style');
  style.id = 'nt-notes-styles';
  style.textContent = `
    .nt-container {
      display: flex;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .nt-sidebar {
      width: 220px;
      background: var(--ae-bg-primary);
      border-right: 1px solid var(--ae-border);
      display: flex;
      flex-direction: column;
    }
    .nt-sidebar-header {
      display: flex;
      gap: 6px;
      padding: 10px;
      border-bottom: 1px solid var(--ae-border);
    }
    .nt-search {
      flex: 1;
      padding: 6px 8px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: 6px;
      color: var(--ae-text-primary);
      font-size: 12px;
      outline: none;
    }
    .nt-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ae-accent);
      border: none;
      border-radius: 6px;
      color: #000;
      cursor: pointer;
    }
    .nt-btn svg { width: 14px; height: 14px; }
    .nt-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nt-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
      background: var(--ae-bg-secondary);
    }
    .nt-item:hover { background: var(--ae-bg-tertiary); }
    .nt-item.active { background: var(--ae-accent-glow); border-left: 3px solid var(--ae-accent); }
    .nt-item-body { flex: 1; min-width: 0; }
    .nt-item-title { font-size: 12px; font-weight: 600; color: var(--ae-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nt-item-preview { font-size: 11px; color: var(--ae-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
    .nt-item-del { background: none; border: none; color: var(--ae-text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; }
    .nt-item-del:hover { color: var(--ae-danger); }
    .nt-editor-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #0d0d18;
    }
    .nt-textarea {
      flex: 1;
      padding: 20px;
      background: transparent;
      border: none;
      outline: none;
      resize: none;
      color: var(--ae-text-primary);
      font-family: var(--ae-font-ui);
      font-size: 14px;
      line-height: 1.6;
    }
    .nt-statusbar {
      display: flex;
      justify-content: space-between;
      padding: 6px 16px;
      background: var(--ae-bg-primary);
      border-top: 1px solid var(--ae-border);
      font-size: 11px;
      color: var(--ae-text-muted);
    }
    .nt-empty {
      text-align: center;
      padding: 24px;
      color: var(--ae-text-muted);
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}
