// apps/calculator.js — Glassmorphism Utility Calculator
// Aetherium OS — Utility Subsystem

export const appInfo = {
  id: 'calculator',
  title: 'Calculator',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>`,
  defaultWidth: 320,
  defaultHeight: 460,
  minWidth: 280,
  minHeight: 380,
  singleton: true,
  category: 'utility'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let displayVal = '0';
  let prevVal = null;
  let currentOp = null;
  let resetNext = false;

  container.innerHTML = `
    <div class="calc-container">
      <div class="calc-display-wrap">
        <div class="calc-expression"></div>
        <div class="calc-result">0</div>
      </div>
      <div class="calc-pad">
        <button class="calc-btn fn" data-act="clear">AC</button>
        <button class="calc-btn fn" data-act="sign">±</button>
        <button class="calc-btn fn" data-act="percent">%</button>
        <button class="calc-btn op" data-act="div">÷</button>

        <button class="calc-btn num" data-val="7">7</button>
        <button class="calc-btn num" data-val="8">8</button>
        <button class="calc-btn num" data-val="9">9</button>
        <button class="calc-btn op" data-act="mul">×</button>

        <button class="calc-btn num" data-val="4">4</button>
        <button class="calc-btn num" data-val="5">5</button>
        <button class="calc-btn num" data-val="6">6</button>
        <button class="calc-btn op" data-act="sub">−</button>

        <button class="calc-btn num" data-val="1">1</button>
        <button class="calc-btn num" data-val="2">2</button>
        <button class="calc-btn num" data-val="3">3</button>
        <button class="calc-btn op" data-act="add">+</button>

        <button class="calc-btn num zero" data-val="0">0</button>
        <button class="calc-btn num" data-val=".">.</button>
        <button class="calc-btn eq" data-act="equals">=</button>
      </div>
    </div>
  `;

  const exprEl = container.querySelector('.calc-expression');
  const resultEl = container.querySelector('.calc-result');

  function updateDisplay() {
    resultEl.textContent = displayVal;
  }

  function handleNum(val) {
    if (resetNext) {
      displayVal = val === '.' ? '0.' : val;
      resetNext = false;
    } else {
      if (val === '.' && displayVal.includes('.')) return;
      displayVal = displayVal === '0' && val !== '.' ? val : displayVal + val;
    }
    updateDisplay();
  }

  function handleOp(op) {
    const num = parseFloat(displayVal);
    if (prevVal === null) {
      prevVal = num;
    } else if (currentOp) {
      prevVal = compute(prevVal, num, currentOp);
      displayVal = String(prevVal);
      updateDisplay();
    }
    currentOp = op;
    resetNext = true;
    exprEl.textContent = `${prevVal} ${_opSymbol(op)}`;
  }

  function _opSymbol(op) {
    switch (op) {
      case 'add': return '+';
      case 'sub': return '−';
      case 'mul': return '×';
      case 'div': return '÷';
    }
    return '';
  }

  function compute(a, b, op) {
    switch (op) {
      case 'add': return a + b;
      case 'sub': return a - b;
      case 'mul': return a * b;
      case 'div': return b === 0 ? 0 : a / b;
    }
    return b;
  }

  function handleEquals() {
    if (currentOp && prevVal !== null) {
      const num = parseFloat(displayVal);
      const res = compute(prevVal, num, currentOp);
      exprEl.textContent = `${prevVal} ${_opSymbol(currentOp)} ${num} =`;
      displayVal = String(res);
      prevVal = null;
      currentOp = null;
      resetNext = true;
      updateDisplay();
    }
  }

  container.querySelector('.calc-pad').addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;

    if (btn.dataset.val) {
      handleNum(btn.dataset.val);
    } else if (btn.dataset.act) {
      const act = btn.dataset.act;
      if (act === 'clear') {
        displayVal = '0';
        prevVal = null;
        currentOp = null;
        exprEl.textContent = '';
        updateDisplay();
      } else if (act === 'sign') {
        displayVal = String(-parseFloat(displayVal));
        updateDisplay();
      } else if (act === 'percent') {
        displayVal = String(parseFloat(displayVal) / 100);
        updateDisplay();
      } else if (act === 'equals') {
        handleEquals();
      } else {
        handleOp(act);
      }
    }
  });

  return () => {};
}

function _injectStyles() {
  if (document.getElementById('calc-styles')) return;
  const style = document.createElement('style');
  style.id = 'calc-styles';
  style.textContent = `
    .calc-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ae-bg-solid);
      padding: 16px;
      user-select: none;
    }
    .calc-display-wrap {
      background: var(--ae-bg-primary);
      border: 1px solid var(--ae-border);
      border-radius: var(--ae-radius-sm);
      padding: 12px 16px;
      text-align: right;
      margin-bottom: 16px;
    }
    .calc-expression {
      font-size: 13px;
      color: var(--ae-text-muted);
      height: 18px;
    }
    .calc-result {
      font-size: 32px;
      font-weight: 300;
      color: var(--ae-text-primary);
      font-variant-numeric: tabular-nums;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .calc-pad {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .calc-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      border: none;
      border-radius: var(--ae-radius-sm);
      cursor: pointer;
      color: var(--ae-text-primary);
      background: var(--ae-bg-secondary);
      transition: background var(--ae-transition);
    }
    .calc-btn:hover { background: var(--ae-bg-tertiary); }
    .calc-btn.op { background: var(--ae-accent); color: #000; font-weight: 600; }
    .calc-btn.eq { background: var(--ae-accent-secondary); color: #fff; font-weight: 600; }
    .calc-btn.fn { background: rgba(255, 255, 255, 0.08); }
    .calc-btn.zero { grid-column: span 2; }
  `;
  document.head.appendChild(style);
}
