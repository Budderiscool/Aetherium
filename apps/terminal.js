// apps/terminal.js — AetherShell POSIX Command-Line Interpreter
// Aetherium OS — Command Subsystem

import { vfs, normalizePath, dirname, basename } from '../kernel/vfs.js';
import { eventBus } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'terminal',
  title: 'Terminal',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  defaultWidth: 740,
  defaultHeight: 480,
  minWidth: 420,
  minHeight: 280,
  singleton: false,
  category: 'development'
};

const NEOFETCH_ASCII = `
       _____  __  __              _                 
      /  _  \\|  ||  |_  ___  ___|_| _ _  _____     
     |   _   |  ||   _|| -_||  _| || | ||     |    
     |__| |__|__||____||___||_| |_||___||_|_|_|    
`;

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let cwd = args.cwd || '/home/user';
  let history = [];
  let historyIndex = -1;
  let currentUser = 'user';

  container.innerHTML = `
    <div class="sh-container">
      <div class="sh-output"></div>
      <div class="sh-input-line">
        <span class="sh-prompt">${currentUser}@aetherium:<span class="sh-cwd">${_formatPromptCwd(cwd)}</span>$&nbsp;</span>
        <input type="text" class="sh-input" autofocus spellcheck="false" autocomplete="off">
      </div>
    </div>
  `;

  const outputEl = container.querySelector('.sh-output');
  const inputEl = container.querySelector('.sh-input');
  const promptCwdEl = container.querySelector('.sh-cwd');

  // Focus terminal input whenever window is clicked
  container.addEventListener('click', () => inputEl.focus());

  // Welcome Header
  _printBanner();

  function _printBanner() {
    printLine('AetherShell v1.0.0 (x86_64-pc-aetherium-wasm)', 'sh-sys');
    printLine('Type "help" for a list of available commands, or "neofetch" for system telemetry.\n', 'sh-muted');
  }

  function printLine(text, className = '') {
    const div = document.createElement('div');
    div.className = `sh-line ${className}`;
    div.textContent = text;
    outputEl.appendChild(div);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function printHtml(html) {
    const div = document.createElement('div');
    div.className = 'sh-line';
    div.innerHTML = html;
    outputEl.appendChild(div);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function _formatPromptCwd(path) {
    if (path === '/home/user') return '~';
    if (path.startsWith('/home/user/')) return '~' + path.substring(10);
    return path;
  }

  function updatePrompt() {
    promptCwdEl.textContent = _formatPromptCwd(cwd);
    wm.setTitle(windowId, `Terminal — ${cwd}`);
  }

  // Key Event Handling (Enter, History navigation, Tab completion)
  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const commandLine = inputEl.value;
      inputEl.value = '';

      if (commandLine.trim()) {
        history.push(commandLine);
        historyIndex = history.length;
      }

      printLine(`${currentUser}@aetherium:${_formatPromptCwd(cwd)}$ ${commandLine}`, 'sh-cmd-echo');
      await executeCommandLine(commandLine);
      outputEl.scrollTop = outputEl.scrollHeight;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex > 0) {
        historyIndex--;
        inputEl.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        inputEl.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        inputEl.value = '';
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      await handleTabCompletion(inputEl.value);
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      outputEl.innerHTML = '';
    }
  });

  /**
   * Parses and executes shell commands, including chaining (;) and redirection (> / >>).
   */
  async function executeCommandLine(cmdLine) {
    const trimmed = cmdLine.trim();
    if (!trimmed) return;

    // Split multiple chained commands
    const commands = trimmed.split(';').map((s) => s.trim()).filter(Boolean);

    for (const singleCmd of commands) {
      await runSingleCommand(singleCmd);
    }
  }

  async function runSingleCommand(cmdStr) {
    // Redirection detection: echo hello > file.txt or >> file.txt
    let redirectMode = null;
    let redirectTarget = null;
    let actualCmd = cmdStr;

    if (cmdStr.includes('>>')) {
      const parts = cmdStr.split('>>');
      actualCmd = parts[0].trim();
      redirectTarget = parts[1].trim();
      redirectMode = 'append';
    } else if (cmdStr.includes('>')) {
      const parts = cmdStr.split('>');
      actualCmd = parts[0].trim();
      redirectTarget = parts[1].trim();
      redirectMode = 'overwrite';
    }

    const tokens = _tokenize(actualCmd);
    if (tokens.length === 0) return;

    const command = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    let outputText = '';

    try {
      switch (command) {
        case 'help':
          outputText = [
            'AetherShell Built-in Commands:',
            '  ls [-l] [path]       List directory contents',
            '  cd <path>            Change current working directory',
            '  pwd                  Print working directory',
            '  mkdir <path>         Create a directory',
            '  touch <path>         Create an empty file',
            '  cat <path>           Display file contents',
            '  echo <text> [> file] Print text or redirect to file',
            '  rm [-r] <path>       Remove file or directory',
            '  cp <src> <dest>      Copy file or directory',
            '  mv <src> <dest>      Move or rename file',
            '  clear                Clear the terminal screen',
            '  whoami               Display current user',
            '  neofetch             Show system specs and telemetry',
            '  open <path>          Launch associated application',
            '  date                 Display system date and time',
            '  history              Show command history'
          ].join('\n');
          break;

        case 'pwd':
          outputText = cwd;
          break;

        case 'cd': {
          const target = args[0] || '/home/user';
          const resolved = resolvePath(target);
          if (await vfs.exists(resolved)) {
            const stat = await vfs.stat(resolved);
            if (stat.type === 'directory') {
              cwd = resolved;
              updatePrompt();
            } else {
              outputText = `cd: not a directory: ${target}`;
            }
          } else {
            outputText = `cd: no such file or directory: ${target}`;
          }
          break;
        }

        case 'ls': {
          let showLong = false;
          let targetPath = cwd;

          for (const arg of args) {
            if (arg === '-l' || arg === '-la') {
              showLong = true;
            } else if (!arg.startsWith('-')) {
              targetPath = resolvePath(arg);
            }
          }

          if (!(await vfs.exists(targetPath))) {
            outputText = `ls: cannot access '${targetPath}': No such file or directory`;
            break;
          }

          const stat = await vfs.stat(targetPath);
          if (stat.type === 'file') {
            outputText = stat.name;
          } else {
            const items = await vfs.readdir(targetPath);
            if (showLong) {
              const lines = items.map((i) => {
                const typeChar = i.type === 'directory' ? 'd' : '-';
                const dateStr = new Date(i.modified).toLocaleDateString();
                const sizeStr = (i.size || 0).toString().padStart(6, ' ');
                return `${typeChar}rwxr-xr-x 1 user staff ${sizeStr} ${dateStr} ${i.name}`;
              });
              outputText = lines.join('\n');
            } else {
              // Colorized compact listing
              const html = items.map((i) => {
                const isDir = i.type === 'directory';
                return `<span class="${isDir ? 'sh-dir' : 'sh-file'}">${i.name}</span>`;
              }).join('  ');
              printHtml(html);
              return;
            }
          }
          break;
        }

        case 'cat': {
          if (args.length === 0) {
            outputText = 'cat: missing operand';
            break;
          }
          const target = resolvePath(args[0]);
          if (!(await vfs.exists(target))) {
            outputText = `cat: ${args[0]}: No such file or directory`;
          } else {
            const content = await vfs.read(target);
            outputText = typeof content === 'string' ? content : '[Binary Data]';
          }
          break;
        }

        case 'echo':
          outputText = args.join(' ');
          break;

        case 'mkdir': {
          if (args.length === 0) {
            outputText = 'mkdir: missing operand';
            break;
          }
          for (const p of args) {
            const target = resolvePath(p);
            await vfs.mkdir(target, true);
          }
          break;
        }

        case 'touch': {
          if (args.length === 0) {
            outputText = 'touch: missing file operand';
            break;
          }
          for (const p of args) {
            const target = resolvePath(p);
            if (!(await vfs.exists(target))) {
              await vfs.write(target, '');
            }
          }
          break;
        }

        case 'rm': {
          let recursive = false;
          const targets = [];
          for (const a of args) {
            if (a === '-r' || a === '-rf' || a === '-R') {
              recursive = true;
            } else {
              targets.push(a);
            }
          }
          for (const t of targets) {
            const resolved = resolvePath(t);
            await vfs.rm(resolved, recursive);
          }
          break;
        }

        case 'cp': {
          if (args.length < 2) {
            outputText = 'cp: missing destination file operand';
            break;
          }
          await vfs.cp(resolvePath(args[0]), resolvePath(args[1]));
          break;
        }

        case 'mv': {
          if (args.length < 2) {
            outputText = 'mv: missing destination file operand';
            break;
          }
          await vfs.mv(resolvePath(args[0]), resolvePath(args[1]));
          break;
        }

        case 'clear':
          outputEl.innerHTML = '';
          return;

        case 'whoami':
          outputText = currentUser;
          break;

        case 'date':
          outputText = new Date().toString();
          break;

        case 'history':
          outputText = history.map((cmd, i) => `  ${i + 1}  ${cmd}`).join('\n');
          break;

        case 'open': {
          if (args.length === 0) {
            outputText = 'open: missing file operand';
            break;
          }
          const target = resolvePath(args[0]);
          if (!(await vfs.exists(target))) {
            outputText = `open: ${args[0]}: No such file or directory`;
          } else {
            const stat = await vfs.stat(target);
            if (stat.type === 'directory') {
              eventBus.emit('app:launch', { appId: 'files', args: { path: target } });
            } else {
              eventBus.emit('app:launch', { appId: 'editor', args: { filePath: target } });
            }
          }
          break;
        }

        case 'neofetch': {
          const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB / ${Math.round(performance.memory.totalJSHeapSize / 1048576)} MB` : 'Dynamic WebAssembly Sandbox';
          const info = [
            `user@aetherium`,
            `--------------`,
            `OS: Aetherium OS v1.0.0 (WebAssembly / ES6+)`,
            `Host: GitHub Pages Static Runtime`,
            `Kernel: AetherKernel 2026.11`,
            `Uptime: ${Math.round(performance.now() / 1000)}s`,
            `Shell: AetherShell v1.0`,
            `Resolution: ${window.innerWidth}x${window.innerHeight}`,
            `Compositor: Hardware translate3d`,
            `Memory: ${mem}`,
            `VFS: IndexedDB (AetheriumVFS)`,
            `\n\x1b[31m███\x1b[32m███\x1b[33m███\x1b[34m███\x1b[35m███\x1b[36m███`
          ].join('\n');

          const combined = `
<div style="display:flex;gap:20px;align-items:center;">
  <pre style="color:var(--ae-accent);font-weight:bold;margin:0;">${NEOFETCH_ASCII}</pre>
  <pre style="color:var(--ae-text-primary);margin:0;">${info}</pre>
</div>`;
          printHtml(combined);
          return;
        }

        default:
          outputText = `aethershell: command not found: ${command}`;
      }
    } catch (err) {
      outputText = `Error: ${err.message}`;
    }

    // Handle redirection if present
    if (redirectTarget) {
      const destPath = resolvePath(redirectTarget);
      try {
        if (redirectMode === 'append') {
          await vfs.append(destPath, outputText + '\n');
        } else {
          await vfs.write(destPath, outputText + '\n');
        }
      } catch (err) {
        printLine(`aethershell: redirection error: ${err.message}`, 'sh-error');
      }
    } else if (outputText) {
      printLine(outputText);
    }
  }

  function resolvePath(p) {
    if (!p) return cwd;
    if (p.startsWith('/')) return normalizePath(p);
    if (p === '~') return '/home/user';
    if (p.startsWith('~/')) return normalizePath('/home/user/' + p.substring(2));
    if (p === '..') return dirname(cwd);
    if (p.startsWith('../')) {
      let cur = cwd;
      const parts = p.split('/');
      for (const seg of parts) {
        if (seg === '..') cur = dirname(cur);
        else if (seg && seg !== '.') cur = normalizePath(cur + '/' + seg);
      }
      return cur;
    }
    return normalizePath(cwd + '/' + p);
  }

  async function handleTabCompletion(inputVal) {
    const tokens = inputVal.split(' ');
    const lastToken = tokens[tokens.length - 1];

    if (tokens.length === 1) {
      // Complete commands
      const cmds = ['ls', 'cd', 'pwd', 'mkdir', 'touch', 'cat', 'echo', 'rm', 'cp', 'mv', 'clear', 'whoami', 'neofetch', 'open', 'help', 'date', 'history'];
      const matches = cmds.filter((c) => c.startsWith(lastToken));
      if (matches.length === 1) {
        inputEl.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        printLine(matches.join('  '), 'sh-muted');
      }
    } else {
      // Complete file/dir paths
      try {
        const searchDir = lastToken.includes('/') ? dirname(resolvePath(lastToken)) : cwd;
        const prefix = basename(lastToken);
        const entries = await vfs.readdir(searchDir);
        const matches = entries.filter((e) => e.name.startsWith(prefix));

        if (matches.length === 1) {
          const completedPath = lastToken.includes('/') ? `${dirname(lastToken)}/${matches[0].name}` : matches[0].name;
          tokens[tokens.length - 1] = completedPath + (matches[0].type === 'directory' ? '/' : ' ');
          inputEl.value = tokens.join(' ');
        } else if (matches.length > 1) {
          printLine(matches.map((m) => m.name).join('  '), 'sh-muted');
        }
      } catch {}
    }
  }

  function _tokenize(str) {
    const matches = str.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return matches.map((m) => m.replace(/^"|"$/g, ''));
  }

  return () => {};
}

function _injectStyles() {
  if (document.getElementById('sh-terminal-styles')) return;
  const style = document.createElement('style');
  style.id = 'sh-terminal-styles';
  style.textContent = `
    .sh-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #080810;
      color: #e8e8f0;
      font-family: var(--ae-font-mono);
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      overflow: hidden;
      cursor: text;
    }
    .sh-output {
      flex: 1;
      overflow-y: auto;
      word-break: break-all;
    }
    .sh-line {
      white-space: pre-wrap;
      margin-bottom: 2px;
    }
    .sh-cmd-echo {
      color: #a0a0b8;
    }
    .sh-sys {
      color: var(--ae-accent);
      font-weight: 600;
    }
    .sh-muted {
      color: #606078;
    }
    .sh-dir {
      color: #00d4ff;
      font-weight: 600;
      margin-right: 12px;
    }
    .sh-file {
      color: #e8e8f0;
      margin-right: 12px;
    }
    .sh-error {
      color: var(--ae-danger);
    }
    .sh-input-line {
      display: flex;
      align-items: center;
      margin-top: 6px;
    }
    .sh-prompt {
      color: #22c55e;
      font-weight: 600;
      white-space: nowrap;
    }
    .sh-cwd {
      color: #00d4ff;
    }
    .sh-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}
