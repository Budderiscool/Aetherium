# Aetherium OS (v1.0.0)

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?logo=github)](https://pages.github.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Architecture](https://img.shields.io/badge/Architecture-100%25%20Client--Side%20ES6%2B-cyan)](#architectural-overview)

> **Aetherium** (Atomic Number 119 &bull; Symbol: **Ae**) is a modular, high-performance, browser-based operating system built from the ground up for static deployment on **GitHub Pages**. Running 100% client-side with vanilla ES6+ modules, it combines an asynchronous IndexedDB Virtual File System (VFS), a hardware-accelerated window compositor, and a Service Worker-based web proxy client.

---

## Table of Contents
1. [Architectural Overview](#architectural-overview)
2. [Key Subsystems](#key-subsystems)
   - [Kernel, Bootloader & Compositor](#1-kernel-bootloader--compositor)
   - [Virtual File System (VFS) & IPC](#2-virtual-file-system-vfs--ipc)
   - [AetherNet Web Proxy Engine](#3-aethernet-web-proxy-engine)
   - [Built-In Applications](#4-built-in-applications)
3. [GitHub Pages Deployment Guide](#github-pages-deployment-guide)
4. [AetherNet Proxy & Transport Relay Setup](#aethernet-proxy--transport-relay-setup)
5. [Keyboard Shortcuts & Gestures](#keyboard-shortcuts--gestures)
6. [Repository Structure](#repository-structure)

---

## Architectural Overview

Traditional web desktops rely on Node.js/Python backends, Docker containers, or Electron wrappers. Aetherium runs **100% client-side** directly in modern web browsers:

- **Zero Build Tooling Required**: Pure vanilla ES6 modules with relative imports (`./`), executable straight from raw static file servers.
- **Subpath Agnostic**: Designed specifically for GitHub Pages repositories (`username.github.io/Aetherium/`) by utilizing relative root-scoped Service Worker registration (`navigator.serviceWorker.register('./sw.js', { scope: './' })`).
- **Hardware-Accelerated Compositing**: Fluid window positioning via CSS3 3D transforms (`transform: translate3d(x, y, 0)`), reducing CPU layout thrashing during multi-window dragging and 8-directional resizing.
- **POSIX-Style IndexedDB Storage**: Persistent file system with true hierarchical paths, binary and text support, and live event reactivity across applications.

---

## Key Subsystems

### 1. Kernel, Bootloader & Compositor
- **Authentic Bootloader**: Displays the Aetherium periodic card (Ae 119), streaming real-time kernel initialization diagnostics (mounting VFS, registering Service Workers, dynamically importing app modules).
- **Multi-User Lock Screen**: First-run account creation with password/PIN generation, credential verification against `/system/config/users.json`, and instant Guest login bypass.
- **Window Compositor**:
  - Dragging with live edge detection and **snap visual zones** (left-half split, right-half split, top full-screen maximize).
  - 8-directional edge/corner resize handles with responsive min/max constraints.
  - Dynamic focus stacking (`z-index`) and active titlebar state reflection.
  - Multi-virtual workspace controller (up to 6 independent virtual desktops) switchable from the top status bar.

### 2. Virtual File System (VFS) & IPC
- **IndexedDB Object Store**: Powered by the custom `VirtualFileSystem` class in `kernel/vfs.js`.
- **Default POSIX Tree**:
  ```
  /home/user/Desktop
  /home/user/Documents
  /home/user/Documents/notes
  /home/user/Downloads
  /home/user/Pictures
  /home/user/Music
  /system/apps
  /system/config
  /system/wallpapers
  /tmp
  ```
- **File APIs**: `read`, `write`, `append`, `mkdir`, `rm`, `mv`, `cp`, `stat`, `readdir`, `exists`, `exportBackup`, `importBackup`, and `factoryReset`.
- **Event Bus & Process Registry**: Decoupled pub/sub event pipeline (`kernel/ipc.js`) broadcasting file changes, process spawns/kills, toast notifications, and clipboard data.

### 3. AetherNet Web Proxy Engine
Standard `<iframe>` embeds fail when navigating external sites due to `X-Frame-Options: DENY` and `Content-Security-Policy` headers. AetherNet implements a genuine client-side proxy:
- Requests targeting external domains are intercepted by `sw.js` at `/__aether_proxy__/`.
- The Service Worker rewrites fetched HTML attributes (`href`, `src`, `action`) so nested navigations stay routed through the proxy.
- Strips framing security headers in flight.
- Forwards traffic through configurable **Bare Server** or **CORS Gateway** transport relays.

### 4. Built-In Applications
| Application | Identifier | Description |
|---|---|---|
| **AetherNet** | `browser` | Multi-tabbed proxy browser with bookmarks, omnibox search, and Eruda DevTools injection. |
| **Files** | `files` | Dual-pane POSIX file explorer with host upload/export, breadcrumbs, and image previewers. |
| **AetherShell** | `terminal` | Interactive CLI directly bound to the VFS (`ls`, `cd`, `cat`, `echo >`, `neofetch`, `rm`, `mv`, etc.). |
| **Code Editor** | `editor` | Multi-tab text/code editor with line numbers, syntax recognition, and live HTML execution. |
| **System Monitor**| `monitor` | Task manager with active process list, force-kill, simulated CPU graph, and real JS heap metrics. |
| **Settings** | `settings` | Appearance theme picker (Dark/Light/Glass), procedural wallpapers, and proxy configuration. |
| **Calculator** | `calculator`| High-precision glassmorphism calculator with operator chaining. |
| **Notes** | `notes` | Auto-saving notepad with search and word/character analytics saved to `/home/user/Documents/notes/`.|
| **Media Player** | `mediaplayer`| HTML5 audio/video player with live animated canvas visualizer and playlist support. |

---

## GitHub Pages Deployment Guide

Deploying Aetherium to GitHub Pages takes under 60 seconds with zero compilation:

1. **Create Repository**:
   Create a new GitHub repository named `Aetherium` (or your preferred repository name).
2. **Push the Codebase**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Aetherium OS"
   git branch -M main
   git remote add origin https://github.com/<your-username>/Aetherium.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Go to **Repository Settings** &rarr; **Pages**.
   - Under **Build and deployment**, select **Source**: `Deploy from a branch`.
   - Select Branch: `main` & Folder: `/(root)`.
   - Click **Save**.
4. **Access the OS**:
   Your operating system will be live at:
   ```
   https://<your-username>.github.io/Aetherium/
   ```

> **Why It Works Seamlessly on GitHub Pages**:
> - All asset references (`href`, `src`, ES module imports) use relative paths (`./styles/system.css`, `./kernel/boot.js`).
> - The Service Worker registers with relative scope: `navigator.serviceWorker.register('./sw.js', { scope: './' })`, preventing subpath `SecurityError` exceptions.

---

## AetherNet Proxy & Transport Relay Setup

Browsers cannot open raw TCP sockets directly from client-side JavaScript. While Aetherium's Service Worker handles request rewriting and CSP removal locally in your browser, external packets must be forwarded through a lightweight transport relay.

### Default Public Endpoint
Aetherium ships preconfigured with a public Bare transport node:
- Endpoint: `https://bare.benroberts.net/`
- Protocol: `Bare Server (v3 Protocol)`

### Deploying Your Own Free Wisp/Bare Server
If public nodes experience rate limits or downtime, you can deploy your own node for free in minutes on **Render**, **Koyeb**, or **Cloudflare Workers**:

1. Clone or deploy the official [TompHTTP Bare Server Node](https://github.com/tomphttp/bare-server-node) to Render / Koyeb:
   ```bash
   npm install @tomphttp/bare-server-node
   ```
2. Once your server URL is generated (e.g. `https://my-bare-relay.onrender.com/`), open Aetherium:
   - Launch **System Settings** &rarr; **Network & Proxy**.
   - Paste your endpoint URL into the **Transport Relay Server Endpoint** field.
   - Click **Save & Update Proxy**.
   - The Service Worker will immediately route all subsequent AetherNet navigations through your dedicated relay.

---

## Keyboard Shortcuts & Gestures

| Shortcut / Action | Subsystem | Action |
|---|---|---|
| <kbd>Alt</kbd> + <kbd>Space</kbd> | Global Shell | Trigger Spotlight Search Overlay |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Code Editor | Quick Save Active Document to VFS |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> | Terminal | Clear Terminal Output Buffer |
| <kbd>Arrow Up</kbd> / <kbd>Down</kbd> | Terminal | Cycle Command History |
| <kbd>Tab</kbd> | Terminal | Autocomplete Commands & File Paths |
| **Titlebar Drag to Left/Right** | Window Compositor | Snap Window to Half-Screen Split |
| **Titlebar Drag to Top Edge** | Window Compositor | Maximize Window |
| **Titlebar Double Click** | Window Compositor | Toggle Window Maximization |
| **Desktop Right-Click** | Desktop Shell | Open Context Menu (New Folder, New File, etc.) |
| **Desktop Drag Selection** | Desktop Shell | Rubber-band Multi-Icon Selection |

---

## Repository Structure

```
c:\Users\austi\Downloads\Aetjerium\
├── index.html          # Bootloader markup, desktop shell, and system overlay templates
├── sw.js               # Service Worker for offline asset caching & proxy request rewriting
├── README.md           # Setup, architecture, and deployment guide
├── styles/
│   ├── system.css      # Glassmorphism design tokens, animations, wallpapers & overlays
│   └── wm.css          # Window compositor, dock, top status bar, snap zones & workspaces
├── kernel/
│   ├── boot.js         # Boot sequence orchestrator, multi-user lock screen & app runner
│   ├── vfs.js          # Asynchronous IndexedDB POSIX Virtual File System engine
│   ├── wm.js           # Window manager, translate3d dragging, 8-directional resizer
│   └── ipc.js          # EventBus pub/sub, process registry, toast alerts & clipboard
└── apps/
    ├── browser.js      # AetherNet multi-tabbed web proxy browser with Eruda DevTools
    ├── files.js        # Dual-pane POSIX file explorer with host upload/export
    ├── terminal.js     # AetherShell CLI with neofetch, piping & history
    ├── editor.js       # Code & text editor with line numbers & live HTML execution
    ├── monitor.js      # Task manager with process kill & performance canvas charts
    ├── settings.js     # Appearance theming, wallpapers, VFS backups & proxy config
    ├── calculator.js   # Glassmorphism scientific calculator utility
    ├── notes.js        # Auto-saving notepad directly integrated with VFS
    └── mediaplayer.js  # Audio/video player with canvas-based audio visualizer
```

---

## License

MIT License &bull; Copyright (c) 2026 Aetherium OS Architecture Group.
Distributed freely for personal, educational, and production use.
