// apps/monitor.js — System Monitor & Task Manager Subsystem
// Aetherium OS — Process Supervision & Real-Time Performance Telemetry

import { processRegistry, eventBus, notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'monitor',
  title: 'System Monitor',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  defaultWidth: 760,
  defaultHeight: 520,
  minWidth: 460,
  minHeight: 320,
  singleton: true,
  category: 'system'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let activeTab = 'processes'; // 'processes' | 'performance'
  let cpuHistory = Array(40).fill(15);
  let memoryHistory = Array(40).fill(25);
  let timerId = null;

  container.innerHTML = `
    <div class="sm-container">
      <!-- Tabs Bar -->
      <div class="sm-tabs">
        <button class="sm-tab active" data-tab="processes">Processes</button>
        <button class="sm-tab" data-tab="performance">Performance &amp; Telemetry</button>
      </div>

      <!-- Processes View -->
      <div class="sm-view sm-processes-view">
        <div class="sm-table-wrap">
          <table class="sm-table">
            <thead>
              <tr>
                <th>Process Name</th>
                <th>PID</th>
                <th>CPU %</th>
                <th>Memory</th>
                <th>Uptime</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody class="sm-process-rows"></tbody>
          </table>
        </div>
        <div class="sm-toolbar">
          <button class="ae-btn sm-kill-btn" disabled>End Process</button>
          <span class="sm-status-info">0 active processes</span>
        </div>
      </div>

      <!-- Performance View -->
      <div class="sm-view sm-performance-view" style="display: none;">
        <div class="sm-perf-grid">
          <div class="sm-chart-card">
            <div class="sm-chart-title">CPU Utilization (Simulated Threads)</div>
            <canvas class="sm-cpu-canvas" width="320" height="120"></canvas>
            <div class="sm-chart-footer sm-cpu-readout">0%</div>
          </div>
          <div class="sm-chart-card">
            <div class="sm-chart-title">JavaScript Heap Memory</div>
            <canvas class="sm-mem-canvas" width="320" height="120"></canvas>
            <div class="sm-chart-footer sm-mem-readout">0 MB</div>
          </div>
        </div>

        <div class="sm-telemetry-box">
          <div class="sm-telemetry-item">
            <span class="sm-tel-label">DOM Node Count:</span>
            <span class="sm-tel-value sm-dom-count">0</span>
          </div>
          <div class="sm-telemetry-item">
            <span class="sm-tel-label">Hardware Concurrency:</span>
            <span class="sm-tel-value">${navigator.hardwareConcurrency || 4} Cores</span>
          </div>
          <div class="sm-telemetry-item">
            <span class="sm-tel-label">Renderer:</span>
            <span class="sm-tel-value">Hardware Accelerated WebGL/2D</span>
          </div>
          <div class="sm-telemetry-item">
            <span class="sm-tel-label">Compositor Latency:</span>
            <span class="sm-tel-value sm-fps-readout">60 FPS</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const tabs = container.querySelectorAll('.sm-tab');
  const processesView = container.querySelector('.sm-processes-view');
  const performanceView = container.querySelector('.sm-performance-view');
  const processRows = container.querySelector('.sm-process-rows');
  const killBtn = container.querySelector('.sm-kill-btn');
  const statusInfo = container.querySelector('.sm-status-info');
  const cpuCanvas = container.querySelector('.sm-cpu-canvas');
  const memCanvas = container.querySelector('.sm-mem-canvas');
  const cpuReadout = container.querySelector('.sm-cpu-readout');
  const memReadout = container.querySelector('.sm-mem-readout');
  const domCountEl = container.querySelector('.sm-dom-count');

  let selectedPid = null;

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      processesView.style.display = activeTab === 'processes' ? 'flex' : 'none';
      performanceView.style.display = activeTab === 'performance' ? 'flex' : 'none';
    });
  });

  // End Process
  killBtn.addEventListener('click', () => {
    if (selectedPid) {
      processRegistry.kill(selectedPid);
      notifications.show('Process Terminated', `PID: ${selectedPid}`, { type: 'warning' });
      selectedPid = null;
      killBtn.disabled = true;
      updateProcesses();
    }
  });

  function updateProcesses() {
    const list = processRegistry.getAll();
    processRows.innerHTML = '';
    statusInfo.textContent = `${list.size} active process${list.size === 1 ? '' : 'es'}`;

    for (const [pid, proc] of list.entries()) {
      const row = document.createElement('tr');
      row.dataset.pid = pid;
      if (pid === selectedPid) row.classList.add('selected');

      const uptimeSec = Math.round((Date.now() - (proc.startTime || Date.now())) / 1000);
      const simulatedCpu = ((pid.charCodeAt(0) * 7) % 18 + 1).toFixed(1);
      const simulatedMem = `${((pid.charCodeAt(2) || 45) * 0.8 + 12).toFixed(1)} MB`;

      row.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="sm-proc-icon">${proc.icon || ''}</span>
            <span>${proc.title}</span>
          </div>
        </td>
        <td><code>${pid}</code></td>
        <td>${simulatedCpu}%</td>
        <td>${simulatedMem}</td>
        <td>${uptimeSec}s</td>
        <td>
          <button class="sm-row-kill-btn" title="Kill">&times;</button>
        </td>
      `;

      row.addEventListener('click', () => {
        selectedPid = pid;
        processRows.querySelectorAll('tr').forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
        killBtn.disabled = false;
      });

      row.querySelector('.sm-row-kill-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        processRegistry.kill(pid);
        updateProcesses();
      });

      processRows.appendChild(row);
    }
  }

  function updatePerformance() {
    // 1. CPU simulation
    const currentCpu = Math.min(95, Math.max(8, cpuHistory[cpuHistory.length - 1] + (Math.random() * 16 - 8)));
    cpuHistory.shift();
    cpuHistory.push(currentCpu);
    cpuReadout.textContent = `${currentCpu.toFixed(1)}%`;
    _drawSparkline(cpuCanvas, cpuHistory, '#00d4ff');

    // 2. Memory
    let currentMemMb = 48;
    if (performance.memory) {
      currentMemMb = Math.round(performance.memory.usedJSHeapSize / 1048576);
    } else {
      currentMemMb = 32 + Math.round(Math.random() * 8);
    }
    memoryHistory.shift();
    memoryHistory.push(currentMemMb);
    memReadout.textContent = `${currentMemMb} MB`;
    _drawSparkline(memCanvas, memoryHistory, '#6366f1');

    // 3. DOM Nodes
    domCountEl.textContent = document.getElementsByTagName('*').length.toString();
  }

  function _drawSparkline(canvas, data, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const max = Math.max(...data, 100);
    const step = w / (data.length - 1);

    data.forEach((val, i) => {
      const x = i * step;
      const y = h - (val / max) * (h - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill gradient below curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
    ctx.fill();
  }

  updateProcesses();
  updatePerformance();

  timerId = setInterval(() => {
    updateProcesses();
    if (activeTab === 'performance') {
      updatePerformance();
    }
  }, 1000);

  return () => {
    if (timerId) clearInterval(timerId);
  };
}

function _injectStyles() {
  if (document.getElementById('sm-monitor-styles')) return;
  const style = document.createElement('style');
  style.id = 'sm-monitor-styles';
  style.textContent = `
    .sm-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .sm-tabs {
      display: flex;
      background: var(--ae-bg-primary);
      border-bottom: 1px solid var(--ae-border);
      padding: 0 12px;
    }
    .sm-tab {
      padding: 10px 18px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--ae-text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .sm-tab.active {
      color: var(--ae-accent);
      border-bottom-color: var(--ae-accent);
    }
    .sm-view {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .sm-table-wrap {
      flex: 1;
      overflow-y: auto;
    }
    .sm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .sm-table th, .sm-table td {
      padding: 8px 12px;
      text-align: left;
    }
    .sm-table th {
      background: var(--ae-bg-secondary);
      color: var(--ae-text-muted);
      border-bottom: 1px solid var(--ae-border);
      position: sticky;
      top: 0;
    }
    .sm-table tr:hover {
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }
    .sm-table tr.selected {
      background: var(--ae-accent-glow);
    }
    .sm-proc-icon svg {
      width: 14px;
      height: 14px;
    }
    .sm-row-kill-btn {
      background: none;
      border: none;
      color: var(--ae-danger);
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
    }
    .sm-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: var(--ae-bg-primary);
      border-top: 1px solid var(--ae-border);
    }
    .sm-status-info {
      font-size: 12px;
      color: var(--ae-text-muted);
    }
    .sm-perf-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 16px;
    }
    .sm-chart-card {
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius-sm);
      padding: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sm-chart-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--ae-text-secondary);
      margin-bottom: 8px;
    }
    .sm-chart-footer {
      font-size: 16px;
      font-weight: 700;
      color: var(--ae-accent);
      margin-top: 6px;
      font-family: var(--ae-font-mono);
    }
    .sm-telemetry-box {
      margin: 0 16px;
      padding: 14px;
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius-sm);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .sm-telemetry-item {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }
    .sm-tel-label {
      color: var(--ae-text-secondary);
    }
    .sm-tel-value {
      font-weight: 600;
      color: var(--ae-accent);
    }
  `;
  document.head.appendChild(style);
}
