// apps/editor.js — Syntax-Highlighted Code & Text Editor with Live HTML Runner
// Aetherium OS — Developer Application Subsystem

import { vfs, normalizePath, basename } from '../kernel/vfs.js';
import { notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'editor',
  title: 'Code Editor',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  defaultWidth: 860,
  defaultHeight: 580,
  minWidth: 440,
  minHeight: 300,
  singleton: false,
  category: 'development'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let openFiles = [];
  let activeFileIndex = -1;
  let isSplitPreviewActive = false;

  container.innerHTML = `
    <div class="ed-container">
      <!-- Toolbar -->
      <div class="ed-toolbar">
        <div class="ed-tabs-list"></div>
        <div class="ed-actions">
          <button class="ed-btn ed-new-btn" title="New File">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="ed-btn ed-save-btn" title="Save File (Ctrl+S)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
          <button class="ed-btn ed-run-btn" title="Run Live HTML/JS Preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      </div>

      <!-- Editor Body: Line numbers + Textarea + Optional Live Preview -->
      <div class="ed-body">
        <div class="ed-code-pane">
          <div class="ed-line-numbers">1</div>
          <textarea class="ed-textarea" spellcheck="false" placeholder="Write or edit code here..."></textarea>
        </div>
        <div class="ed-preview-pane" style="display: none;">
          <div class="ed-preview-bar">
            <span>Live Output Preview</span>
            <button class="ed-btn-close-preview">&times;</button>
          </div>
          <iframe class="ed-preview-frame" sandbox="allow-scripts allow-modals"></iframe>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="ed-statusbar">
        <span class="ed-status-pos">Ln 1, Col 1</span>
        <span class="ed-status-type">Plain Text</span>
        <span class="ed-status-encoding">UTF-8</span>
      </div>
    </div>
  `;

  const tabsList = container.querySelector('.ed-tabs-list');
  const textarea = container.querySelector('.ed-textarea');
  const lineNumbers = container.querySelector('.ed-line-numbers');
  const previewPane = container.querySelector('.ed-preview-pane');
  const previewFrame = container.querySelector('.ed-preview-frame');
  const saveBtn = container.querySelector('.ed-save-btn');
  const newBtn = container.querySelector('.ed-new-btn');
  const runBtn = container.querySelector('.ed-run-btn');
  const closePreviewBtn = container.querySelector('.ed-btn-close-preview');
  const statusPos = container.querySelector('.ed-status-pos');
  const statusType = container.querySelector('.ed-status-type');

  function openFile(path, content = '', isNew = false) {
    const existingIdx = openFiles.findIndex((f) => f.path === path);
    if (existingIdx !== -1) {
      selectTab(existingIdx);
      return;
    }

    const fileObj = {
      path: path,
      name: basename(path) || 'untitled.txt',
      content: content,
      modified: false,
      isNew: isNew
    };

    openFiles.push(fileObj);
    renderTabs();
    selectTab(openFiles.length - 1);
  }

  function selectTab(index) {
    if (index < 0 || index >= openFiles.length) return;
    activeFileIndex = index;
    const file = openFiles[index];

    textarea.value = file.content;
    updateLineNumbers();
    updateCursorStatus();
    statusType.textContent = _detectLanguage(file.name);
    wm.setTitle(windowId, `Editor — ${file.name}${file.modified ? ' *' : ''}`);
    renderTabs();
  }

  function closeTab(index, e) {
    if (e) e.stopPropagation();
    const file = openFiles[index];
    if (file.modified) {
      if (!confirm(`Save changes to ${file.name} before closing?`)) {
        return;
      }
    }

    openFiles.splice(index, 1);
    if (openFiles.length === 0) {
      openFile('/home/user/untitled.txt', '', true);
    } else {
      selectTab(Math.max(0, index - 1));
    }
  }

  function renderTabs() {
    tabsList.innerHTML = '';
    openFiles.forEach((file, idx) => {
      const tabEl = document.createElement('div');
      tabEl.className = `ed-tab ${idx === activeFileIndex ? 'active' : ''}`;
      tabEl.innerHTML = `
        <span class="ed-tab-title">${file.name}${file.modified ? ' •' : ''}</span>
        <button class="ed-tab-close">&times;</button>
      `;
      tabEl.addEventListener('click', () => selectTab(idx));
      tabEl.querySelector('.ed-tab-close').addEventListener('click', (e) => closeTab(idx, e));
      tabsList.appendChild(tabEl);
    });
  }

  async function saveActiveFile() {
    if (activeFileIndex === -1) return;
    const file = openFiles[activeFileIndex];

    if (file.isNew) {
      const targetPath = prompt('Save file path:', file.path);
      if (!targetPath) return;
      file.path = normalizePath(targetPath);
      file.name = basename(file.path);
      file.isNew = false;
    }

    try {
      file.content = textarea.value;
      await vfs.write(file.path, file.content);
      file.modified = false;
      renderTabs();
      wm.setTitle(windowId, `Editor — ${file.name}`);
      notifications.show('Saved', file.name, { type: 'success' });
    } catch (err) {
      notifications.show('Save Error', err.message, { type: 'error' });
    }
  }

  function runLivePreview() {
    isSplitPreviewActive = !isSplitPreviewActive;
    previewPane.style.display = isSplitPreviewActive ? 'flex' : 'none';

    if (isSplitPreviewActive) {
      const code = textarea.value;
      const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
      doc.open();
      doc.write(code);
      doc.close();
    }
  }

  function updateLineNumbers() {
    const lines = textarea.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  }

  function updateCursorStatus() {
    const pos = textarea.selectionStart;
    const lines = textarea.value.substring(0, pos).split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    statusPos.textContent = `Ln ${lineNum}, Col ${colNum}`;
  }

  // Textarea listeners
  textarea.addEventListener('input', () => {
    updateLineNumbers();
    if (activeFileIndex !== -1) {
      openFiles[activeFileIndex].content = textarea.value;
      if (!openFiles[activeFileIndex].modified) {
        openFiles[activeFileIndex].modified = true;
        renderTabs();
        wm.setTitle(windowId, `Editor — ${openFiles[activeFileIndex].name} *`);
      }
    }
    if (isSplitPreviewActive) {
      const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
      doc.open();
      doc.write(textarea.value);
      doc.close();
    }
  });

  textarea.addEventListener('click', updateCursorStatus);
  textarea.addEventListener('keyup', updateCursorStatus);

  // Tab key indents 2 spaces instead of leaving textarea
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveActiveFile();
    }
  });

  // Line numbers sync scroll
  textarea.addEventListener('scroll', () => {
    lineNumbers.scrollTop = textarea.scrollTop;
  });

  saveBtn.addEventListener('click', saveActiveFile);
  runBtn.addEventListener('click', runLivePreview);
  closePreviewBtn.addEventListener('click', () => {
    isSplitPreviewActive = false;
    previewPane.style.display = 'none';
  });

  newBtn.addEventListener('click', () => {
    openFile(`/home/user/untitled-${Date.now().toString().slice(-4)}.js`, '', true);
  });

  // Initial load
  if (args.filePath) {
    vfs.read(args.filePath).then((content) => {
      openFile(args.filePath, content, false);
    }).catch(() => {
      openFile(args.filePath, '', true);
    });
  } else {
    // Open default sample file
    const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; background: #0f0f19; color: #00d4ff; text-align: center; padding-top: 40px; }
    h1 { font-size: 28px; }
    p { color: #a0a0b8; }
  </style>
</head>
<body>
  <h1>Aetherium Live Sandbox</h1>
  <p>Edit this code in the editor pane to see changes in real-time!</p>
</body>
</html>`;
    openFile('/home/user/index.html', sampleHtml, false);
  }

  return () => {};
}

function _detectLanguage(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.js')) return 'JavaScript';
  if (lower.endsWith('.html')) return 'HTML';
  if (lower.endsWith('.css')) return 'CSS';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.md')) return 'Markdown';
  return 'Plain Text';
}

function _injectStyles() {
  if (document.getElementById('ed-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'ed-editor-styles';
  style.textContent = `
    .ed-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0d0d18;
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .ed-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 36px;
      background: var(--ae-bg-primary);
      border-bottom: 1px solid var(--ae-border);
      padding: 0 8px;
    }
    .ed-tabs-list {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
    }
    .ed-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--ae-bg-secondary);
      border: 1px solid var(--ae-border);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .ed-tab.active {
      background: var(--ae-bg-tertiary);
      border-color: var(--ae-accent);
      color: var(--ae-accent);
    }
    .ed-tab-close {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 14px;
    }
    .ed-actions {
      display: flex;
      gap: 4px;
    }
    .ed-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--ae-text-secondary);
      cursor: pointer;
    }
    .ed-btn:hover {
      background: var(--ae-bg-tertiary);
      color: var(--ae-text-primary);
    }
    .ed-btn svg {
      width: 16px;
      height: 16px;
    }
    .ed-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .ed-code-pane {
      flex: 1;
      display: flex;
      background: #080810;
      overflow: hidden;
    }
    .ed-line-numbers {
      width: 44px;
      padding: 12px 6px;
      text-align: right;
      color: var(--ae-text-muted);
      font-family: var(--ae-font-mono);
      font-size: 13px;
      line-height: 1.5;
      user-select: none;
      border-right: 1px solid var(--ae-border);
      overflow: hidden;
    }
    .ed-textarea {
      flex: 1;
      padding: 12px;
      background: transparent;
      border: none;
      outline: none;
      resize: none;
      font-family: var(--ae-font-mono);
      font-size: 13px;
      line-height: 1.5;
      color: #e8e8f0;
      white-space: pre;
      overflow: auto;
    }
    .ed-preview-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-left: 1px solid var(--ae-border);
      background: #fff;
    }
    .ed-preview-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      background: var(--ae-bg-secondary);
      font-size: 11px;
      color: var(--ae-text-secondary);
    }
    .ed-btn-close-preview {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 14px;
    }
    .ed-preview-frame {
      flex: 1;
      border: none;
      width: 100%;
      height: 100%;
    }
    .ed-statusbar {
      display: flex;
      justify-content: space-between;
      padding: 4px 12px;
      background: var(--ae-bg-primary);
      border-top: 1px solid var(--ae-border);
      font-size: 11px;
      color: var(--ae-text-secondary);
    }
  `;
  document.head.appendChild(style);
}
