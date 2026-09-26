import type { Action, AnimationDefinition, AssetManifest, Snapshot } from '../src/models/types';

(function initFloatingOverlay() {
  try {
    if (typeof document === 'undefined') return;
    // The workbench bundle can execute before Electron has created <body>.
    // Defer all DOM work until then; touching document.body during bootstrap
    // aborts the renderer and leaves VS Code-compatible editors on a grey screen.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', initFloatingOverlay, { once: true });
      return;
    }
    if (document.getElementById('codeboy-floating-root')) return;

  const candidatePorts = [43821, 43822, 43823, 43824, 43825];
  const MASCOT_SIZE = 84;
  const PANEL_WIDTH = MASCOT_SIZE * 4;
  const PANEL_GAP = 12;
  const EDITOR_GUTTER = 12;
  const POSITION_KEY = 'codeboy_floating_pos_v2';
  let activePort = 43821;
  let activeBaseUrl = `http://127.0.0.1:${activePort}`;

  // 1. Inject Styles
  const styleEl = document.createElement('style');
  styleEl.id = 'codeboy-floating-styles';
  styleEl.textContent = `
    #codeboy-floating-root {
      position: fixed;
      right: 28px;
      bottom: 30px;
      width: 84px;
      height: 84px;
      z-index: 999999;
      pointer-events: auto;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      background: transparent !important;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45));
      transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
      touch-action: none;
    }
    #codeboy-floating-root:not(.panel-open):hover {
      transform: scale(1.08) translateY(-2px);
    }
    #codeboy-floating-root.dragging {
      cursor: grabbing;
      transform: scale(1.04);
      transition: none;
    }
    #codeboy-floating-canvas {
      width: 84px;
      height: 84px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      background: transparent !important;
      display: block;
      transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #codeboy-floating-speech {
      position: absolute;
      bottom: 88px;
      right: 0;
      min-width: 130px;
      max-width: 220px;
      padding: 7px 10px;
      background: #1c152c;
      color: #f1e9fc;
      border: 1px solid #7c5ea6;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 2px 2px 0 #0d0a17;
      font-family: Consolas, "Courier New", monospace;
      font-size: 11px;
      line-height: 1.4;
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
      z-index: 1000000;
      animation: codeboyPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #codeboy-floating-speech::after {
      content: '';
      position: absolute;
      bottom: -5px;
      right: 28px;
      width: 8px;
      height: 8px;
      background: #1c152c;
      border-right: 1px solid #7c5ea6;
      border-bottom: 1px solid #7c5ea6;
      transform: rotate(45deg);
    }
    #codeboy-floating-panel {
      position: absolute;
      top: 50%;
      width: 336px;
      min-height: 84px;
      background: #181226;
      border: 1px solid #6b4c94;
      border-radius: 4px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6), 2px 2px 0 #0b0813;
      padding: 7px;
      z-index: 1000001;
      font-family: Consolas, "Courier New", monospace;
      cursor: default;
      animation: codeboyPanelIn 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    #codeboy-floating-panel[data-side="right"] {
      left: 96px;
      transform: translateY(-50%);
      transform-origin: left center;
    }
    #codeboy-floating-panel[data-side="left"] {
      right: 96px;
      transform: translateY(-50%);
      transform-origin: right center;
    }
    .codeboy-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 22px;
      padding: 0 2px 6px;
      border-bottom: 1px solid #38254f;
    }
    .codeboy-panel-name {
      font-size: 9px;
      font-weight: bold;
      color: #ffb667;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .codeboy-panel-status {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      color: #a997bd;
      font-size: 8px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .codeboy-panel-close {
      width: 18px;
      height: 18px;
      padding: 0;
      border: 1px solid #4a3469;
      background: #231936;
      color: #b9a9cc;
      font: 14px/14px Consolas, monospace;
      cursor: pointer;
    }
    .codeboy-panel-stats {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 2px 5px;
      color: #bcaacf;
      font-size: 8px;
      white-space: nowrap;
    }
    .codeboy-panel-stats strong { color: #51e4ec; font-weight: normal; }
    .codeboy-panel-actions {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 3px;
    }
    .codeboy-panel-action {
      background: #231936;
      color: #ded3f0;
      border: 1px solid #4a3469;
      border-radius: 2px;
      min-width: 0;
      min-height: 28px;
      padding: 3px 2px;
      font-size: 13px;
      line-height: 1;
      text-align: center;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.1s, color 0.1s;
    }
    .codeboy-panel-action span {
      display: block;
      margin-top: 3px;
      overflow: hidden;
      color: #bbaaca;
      font-size: 7px;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .codeboy-panel-action:hover, .codeboy-panel-close:hover {
      background: #3e2860;
      color: #51e4ec;
      border-color: #51e4ec;
    }
    .codeboy-panel-action[aria-pressed="true"] {
      background: #17333b;
      color: #51e4ec;
      border-color: #438990;
    }
    @keyframes codeboyPanelIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes codeboyPop {
      from { opacity: 0; transform: translateY(6px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  // 2. Build DOM
  const root = document.createElement('div');
  root.id = 'codeboy-floating-root';
  root.title = 'Code Boy · Клик — открыть панель, перетаскивание — переместить';
  root.setAttribute('aria-expanded', 'false');

  const speechEl = document.createElement('div');
  speechEl.id = 'codeboy-floating-speech';
  speechEl.style.display = 'none';

  const canvas = document.createElement('canvas');
  canvas.id = 'codeboy-floating-canvas';
  canvas.width = 64;
  canvas.height = 64;

  const panelEl = document.createElement('div');
  panelEl.id = 'codeboy-floating-panel';
  panelEl.style.display = 'none';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', 'Code Boy controls');
  panelEl.dataset.side = 'left';

  // VS Code and compatible editors enforce Trusted Types in the workbench.
  // Build the panel with DOM APIs so the overlay never needs unsafe innerHTML.
  const panelHeader = document.createElement('div');
  panelHeader.className = 'codeboy-panel-header';
  const panelName = document.createElement('span');
  panelName.className = 'codeboy-panel-name';
  panelName.textContent = 'CODE BOY';
  const panelStatus = document.createElement('span');
  panelStatus.className = 'codeboy-panel-status';
  panelStatus.id = 'codeboy-panel-status';
  panelStatus.textContent = 'Готов к работе';
  const panelClose = document.createElement('button');
  panelClose.className = 'codeboy-panel-close';
  panelClose.dataset.panelCommand = 'close';
  panelClose.setAttribute('aria-label', 'Закрыть панель');
  panelClose.title = 'Закрыть';
  panelClose.textContent = '×';
  panelHeader.append(panelName, panelStatus, panelClose);

  const panelStats = document.createElement('div');
  panelStats.className = 'codeboy-panel-stats';
  panelStats.setAttribute('aria-label', 'Code Boy stats');
  const statDefinitions = [
    ['LV ', 'codeboy-panel-level', '1'],
    ['♥ ', 'codeboy-panel-mood', '75'],
    ['⚡ ', 'codeboy-panel-energy', '85'],
    ['XP ', 'codeboy-panel-xp', '0']
  ] as const;
  for (const [prefix, id, value] of statDefinitions) {
    const stat = document.createElement('span');
    stat.append(document.createTextNode(prefix));
    const strong = document.createElement('strong');
    strong.id = id;
    strong.textContent = value;
    stat.append(strong);
    panelStats.append(stat);
  }

  const panelActions = document.createElement('div');
  panelActions.className = 'codeboy-panel-actions';
  const actionDefinitions = [
    ['pet', '🐾', 'Гладить', 'Погладить', ''],
    ['music', '🎵', 'Музыка', 'Музыка', 'codeboy-panel-music'],
    ['dance', '💃', 'Танец', 'Потанцевать', ''],
    ['vibe', '⚡', 'Vibe', 'Vibe режим', 'codeboy-panel-vibe'],
    ['sleep', '💤', 'Сон', 'Спать или проснуться', 'codeboy-panel-sleep'],
    ['play', '🎮', 'Играть', 'Поиграть', ''],
    ['look', '👀', 'Смотреть', 'Посмотреть вокруг', ''],
    ['room', '🏠', 'Комната', 'Сменить комнату', ''],
    ['settings', '⚙', 'Настройки', 'Настройки Code Boy', ''],
    ['reset', '📍', 'Позиция', 'Сбросить позицию', ''],
    ['hide', '✕', 'Скрыть', 'Скрыть Code Boy', '']
  ] as const;
  for (const [action, icon, label, title, id] of actionDefinitions) {
    const button = document.createElement('button');
    button.className = 'codeboy-panel-action';
    button.dataset.action = action;
    button.title = title;
    if (id) button.id = id;
    button.append(document.createTextNode(icon));
    const caption = document.createElement('span');
    caption.textContent = label;
    button.append(caption);
    panelActions.append(button);
  }
  panelEl.append(panelHeader, panelStats, panelActions);

  root.appendChild(speechEl);
  root.appendChild(canvas);
  root.appendChild(panelEl);
  document.body.appendChild(root);

  // 3. Keep the mascot inside the active code editor (not the sidebar/chrome).
  type SavedPosition = { x: number; y: number };

  function usableRect(element: Element | null): DOMRect | undefined {
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return rect.width >= MASCOT_SIZE + EDITOR_GUTTER * 2 && rect.height >= MASCOT_SIZE + EDITOR_GUTTER * 2
      ? rect
      : undefined;
  }

  function getEditorRect(): DOMRect {
    const selectors = [
      '.editor-group-container.active .monaco-editor',
      '.editor-group-container.active .editor-instance',
      '.part.editor .monaco-editor.focused',
      '.part.editor .monaco-editor',
      '#workbench\\.parts\\.editor',
      '.part.editor'
    ];

    for (const selector of selectors) {
      const rect = usableRect(document.querySelector(selector));
      if (rect) return rect;
    }

    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function clampToEditor(left: number, top: number, editorRect = getEditorRect()): { left: number; top: number } {
    const minLeft = editorRect.left + EDITOR_GUTTER;
    const minTop = editorRect.top + EDITOR_GUTTER;
    const maxLeft = Math.max(minLeft, editorRect.right - MASCOT_SIZE - EDITOR_GUTTER);
    const maxTop = Math.max(minTop, editorRect.bottom - MASCOT_SIZE - EDITOR_GUTTER);
    return {
      left: Math.min(maxLeft, Math.max(minLeft, left)),
      top: Math.min(maxTop, Math.max(minTop, top))
    };
  }

  function placeAt(left: number, top: number): void {
    const clamped = clampToEditor(left, top);
    root.style.left = `${clamped.left}px`;
    root.style.top = `${clamped.top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function defaultPosition(): { left: number; top: number } {
    const editorRect = getEditorRect();
    return clampToEditor(
      editorRect.right - MASCOT_SIZE - 24,
      editorRect.bottom - MASCOT_SIZE - 24,
      editorRect
    );
  }

  function savePosition(): void {
    const rect = root.getBoundingClientRect();
    const editorRect = getEditorRect();
    const availableWidth = Math.max(1, editorRect.width - MASCOT_SIZE - EDITOR_GUTTER * 2);
    const availableHeight = Math.max(1, editorRect.height - MASCOT_SIZE - EDITOR_GUTTER * 2);
    const position: SavedPosition = {
      x: Math.min(1, Math.max(0, (rect.left - editorRect.left - EDITOR_GUTTER) / availableWidth)),
      y: Math.min(1, Math.max(0, (rect.top - editorRect.top - EDITOR_GUTTER) / availableHeight))
    };
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    localStorage.removeItem('codeboy_floating_pos');
  }

  function restorePosition(): void {
    const editorRect = getEditorRect();
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      try {
        const position = JSON.parse(saved) as Partial<SavedPosition>;
        if (typeof position.x === 'number' && typeof position.y === 'number') {
          const availableWidth = Math.max(0, editorRect.width - MASCOT_SIZE - EDITOR_GUTTER * 2);
          const availableHeight = Math.max(0, editorRect.height - MASCOT_SIZE - EDITOR_GUTTER * 2);
          placeAt(
            editorRect.left + EDITOR_GUTTER + availableWidth * Math.min(1, Math.max(0, position.x)),
            editorRect.top + EDITOR_GUTTER + availableHeight * Math.min(1, Math.max(0, position.y))
          );
          return;
        }
      } catch {
        // Fall through to the default editor-relative position.
      }
    }

    // Migrate a position saved by the earlier window-wide overlay when possible.
    const legacyPosition = localStorage.getItem('codeboy_floating_pos');
    if (legacyPosition) {
      try {
        const { left, top } = JSON.parse(legacyPosition) as { left?: unknown; top?: unknown };
        if (typeof left === 'number' && typeof top === 'number') {
          placeAt(left, top);
          savePosition();
          return;
        }
      } catch {
        // Fall through to the default position.
      }
    }

    const position = defaultPosition();
    placeAt(position.left, position.top);
  }

  // Restore saved position and visibility.
  let hiddenByUser = localStorage.getItem('codeboy_floating_hidden') === 'true';
  let hiddenBySetting = false;
  const syncVisibility = () => {
    root.style.display = hiddenByUser || hiddenBySetting ? 'none' : 'flex';
  };
  syncVisibility();

  restorePosition();

  // Helpers: Show / Hide / Toggle / Reset
  function showMascot() {
    hiddenByUser = false;
    localStorage.removeItem('codeboy_floating_hidden');
    syncVisibility();
    canvas.style.transform = 'scale(1.25) translateY(-8px)';
    setTimeout(() => {
      canvas.style.transform = '';
    }, 220);
    showSpeechBubble('Привет! Я тут! 🐾\nКликни по мне — откроется панель.');
  }

  function hideMascot() {
    hiddenByUser = true;
    localStorage.setItem('codeboy_floating_hidden', 'true');
    syncVisibility();
  }

  function toggleVisibility() {
    if (hiddenByUser || hiddenBySetting) {
      showMascot();
    } else {
      hideMascot();
    }
  }

  function resetPosition() {
    localStorage.removeItem(POSITION_KEY);
    localStorage.removeItem('codeboy_floating_pos');
    const position = defaultPosition();
    placeAt(position.left, position.top);
    showMascot();
    showSpeechBubble('Вернулся в угол редактора! 📍');
  }

  function positionPanel(): void {
    if (panelEl.style.display === 'none') return;
    const editorRect = getEditorRect();
    const mascotRect = root.getBoundingClientRect();
    const roomOnLeft = mascotRect.left - editorRect.left - PANEL_GAP;
    const roomOnRight = editorRect.right - mascotRect.right - PANEL_GAP;
    const side = roomOnLeft >= PANEL_WIDTH || roomOnLeft >= roomOnRight ? 'left' : 'right';
    const availableWidth = Math.max(180, Math.floor(side === 'left' ? roomOnLeft : roomOnRight));
    panelEl.dataset.side = side;
    panelEl.style.width = `${Math.min(PANEL_WIDTH, availableWidth)}px`;

    panelEl.style.top = '50%';
    requestAnimationFrame(() => {
      if (panelEl.style.display === 'none') return;
      const panelRect = panelEl.getBoundingClientRect();
      let correction = 0;
      if (panelRect.top < editorRect.top + EDITOR_GUTTER) {
        correction = editorRect.top + EDITOR_GUTTER - panelRect.top;
      } else if (panelRect.bottom > editorRect.bottom - EDITOR_GUTTER) {
        correction = editorRect.bottom - EDITOR_GUTTER - panelRect.bottom;
      }
      panelEl.style.top = `${MASCOT_SIZE / 2 + correction}px`;
    });
  }

  function setPanelOpen(open: boolean): void {
    panelEl.style.display = open ? 'block' : 'none';
    root.classList.toggle('panel-open', open);
    root.setAttribute('aria-expanded', String(open));
    if (open) {
      speechEl.style.display = 'none';
      positionPanel();
    }
  }

  function togglePanel(): void {
    setPanelOpen(panelEl.style.display === 'none');
  }
  // 4. Drag & Click logic using Pointer Events (smooth across iframes and windows)
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let hasMoved = false;
  let speechTimer: ReturnType<typeof setTimeout> | undefined;

  root.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return; // Left click only
    if (panelEl.contains(e.target as Node)) return;

    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = root.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    root.classList.add('dragging');
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();
  });

  root.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
      setPanelOpen(false);
    }

    if (hasMoved) {
      placeAt(initialLeft + dx, initialTop + dy);
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    root.classList.remove('dragging');
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (hasMoved) {
      savePosition();
    } else {
      if (!panelEl.contains(e.target as Node)) {
        togglePanel();
      }
    }
  };

  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // Re-map the saved relative position when the active editor group or layout changes.
  let layoutFrame: number | undefined;
  const scheduleEditorReposition = () => {
    if (isDragging || layoutFrame !== undefined) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = undefined;
      restorePosition();
      positionPanel();
    });
  };
  window.addEventListener('resize', scheduleEditorReposition);
  document.addEventListener('focusin', event => {
    if ((event.target as Element | null)?.closest?.('.monaco-editor, .editor-group-container')) {
      scheduleEditorReposition();
    }
  });
  let observedEditorPart: Element | undefined;
  let editorObserver: MutationObserver | undefined;
  const observeEditorPart = () => {
    const editorPart = document.querySelector('#workbench\\.parts\\.editor, .part.editor');
    if (!editorPart || editorPart === observedEditorPart) return;
    editorObserver?.disconnect();
    observedEditorPart = editorPart;
    editorObserver = new MutationObserver(scheduleEditorReposition);
    editorObserver.observe(editorPart, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    scheduleEditorReposition();
  };
  observeEditorPart();
  if (!observedEditorPart) {
    const workbenchObserver = new MutationObserver(() => {
      observeEditorPart();
      if (observedEditorPart) workbenchObserver.disconnect();
    });
    workbenchObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Keep right-click as an alternative way to open the same panel.
  root.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    if (panelEl.contains(e.target as Node)) return;
    togglePanel();
  });

  // Close on outside click, without consuming the editor click.
  window.addEventListener('click', (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) {
      setPanelOpen(false);
    }
  });

  panelEl.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const commandTarget = (e.target as HTMLElement).closest('[data-panel-command]');
    if (commandTarget?.getAttribute('data-panel-command') === 'close') {
      setPanelOpen(false);
      return;
    }
    const target = (e.target as HTMLElement).closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');

    if (action === 'reset') {
      resetPosition();
      positionPanel();
      return;
    }

    if (action === 'hide') {
      setPanelOpen(false);
      hideMascot();
      return;
    }

    if (action) {
      void triggerAction(action);
    }
  });

  // 5. Canvas Animation & Rendering
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  let manifest: AssetManifest | undefined;
  const imageCache = new Map<string, HTMLImageElement>();
  let currentAnimation: AnimationDefinition | undefined;
  let currentFrame = 0;
  let currentSnapshot: Snapshot | undefined;
  let lastBubble = '';
  let animTimer: ReturnType<typeof setTimeout> | undefined;
  let animRaf: number | undefined;

  function belongsToThisEditor(appName: unknown): boolean {
    if (typeof appName !== 'string' || !appName.trim()) return true;
    const serverName = appName.toLowerCase();
    const hostIdentity = [
      document.title,
      navigator.userAgent,
      document.querySelector('meta[name="application-name"]')?.getAttribute('content') ?? '',
      document.querySelector('.window-title')?.textContent ?? ''
    ].join(' ').toLowerCase();

    if (serverName.includes('antigravity')) return hostIdentity.includes('antigravity');
    if (serverName.includes('visual studio code')) {
      return hostIdentity.includes('visual studio code') && !hostIdentity.includes('antigravity');
    }
    return hostIdentity.includes(serverName);
  }

  async function resolvePort(): Promise<boolean> {
    for (const p of candidatePorts) {
      try {
        const res = await fetch(`http://127.0.0.1:${p}/health`, { mode: 'cors' });
        if (res.ok) {
          const health = await res.json() as { appName?: unknown };
          if (!belongsToThisEditor(health.appName)) continue;
          activePort = p;
          activeBaseUrl = `http://127.0.0.1:${p}`;
          return true;
        }
      } catch {
        // continue
      }
    }
    return false;
  }

  async function loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${activeBaseUrl}/manifest`, { mode: 'cors' });
      manifest = (await res.json()) as AssetManifest;
    } catch (e) {
      console.error('[Code Boy Floating] Could not load manifest:', e);
    }
  }

  async function getImage(srcPath: string): Promise<HTMLImageElement | undefined> {
    if (imageCache.has(srcPath)) return imageCache.get(srcPath);
    try {
      const fullUrl = `${activeBaseUrl}/${srcPath}`;
      const res = await fetch(fullUrl, { mode: 'cors' });
      const blob = await res.blob();
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          imageCache.set(srcPath, img);
          resolve(img);
        };
        img.onerror = () => resolve(undefined);
        img.src = URL.createObjectURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  function renderFrame(anim: AnimationDefinition, frame: number) {
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);

    const img = imageCache.get(anim.src);
    if (img) {
      ctx.drawImage(
        img,
        frame * anim.frameWidth,
        0,
        anim.frameWidth,
        anim.frameHeight,
        0,
        0,
        64,
        64
      );
    }

    // Overlay effects if active
    if (currentSnapshot && manifest) {
      let effectName: string | undefined;
      if (currentSnapshot.state === 'CELEBRATING' || currentSnapshot.state === 'SUCCESS') {
        effectName = 'confetti';
      } else if (currentSnapshot.state === 'VERY_HAPPY') {
        effectName = 'hearts';
      } else if (currentSnapshot.musicPlaying || currentSnapshot.state === 'VIBE_CODING' || currentSnapshot.state === 'DANCING') {
        effectName = 'notes';
      }

      if (effectName && manifest.effects[effectName]) {
        const effectDef = manifest.effects[effectName];
        const effectImg = imageCache.get(effectDef.src);
        if (effectImg) {
          const efFrame = frame % effectDef.frames;
          const destX = Math.round((64 - effectDef.frameWidth) / 2);
          const destY = 0;
          ctx.drawImage(
            effectImg,
            efFrame * effectDef.frameWidth,
            0,
            effectDef.frameWidth,
            effectDef.frameHeight,
            destX,
            destY,
            effectDef.frameWidth,
            effectDef.frameHeight
          );
        }
      }
    }
  }

  function scheduleNextFrame() {
    if (animTimer !== undefined) clearTimeout(animTimer);
    if (animRaf !== undefined) cancelAnimationFrame(animRaf);
    if (!currentAnimation) return;

    const fps = Math.max(4, Math.min(12, currentAnimation.fps || 6));
    animTimer = setTimeout(() => {
      animRaf = requestAnimationFrame(() => {
        if (!currentAnimation) return;
        currentFrame++;
        if (currentFrame >= currentAnimation.frames) {
          if (currentAnimation.loop) {
            currentFrame = 0;
          } else {
            currentFrame = currentAnimation.frames - 1;
            // Switch to idle if one-shot animation finishes
            if (manifest?.character.idle) {
              setAnimation(manifest.character.idle);
              return;
            }
          }
        }
        renderFrame(currentAnimation, currentFrame);
        scheduleNextFrame();
      });
    }, 1000 / fps);
  }

  async function setAnimation(anim: AnimationDefinition) {
    if (currentAnimation?.name === anim.name) return;
    currentAnimation = anim;
    currentFrame = 0;
    await getImage(anim.src);
    renderFrame(anim, 0);
    scheduleNextFrame();
  }

  function showSpeechBubble(text: string) {
    if (!text) {
      speechEl.style.display = 'none';
      return;
    }
    speechEl.textContent = text;
    speechEl.style.display = 'block';

    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speechEl.style.display = 'none';
    }, 4500);
  }

  function handleSnapshot(snapshot: Snapshot) {
    currentSnapshot = snapshot;
    hiddenBySetting = snapshot.settings.floatingOverlay === false;
    syncVisibility();

    const levelEl = document.getElementById('codeboy-panel-level');
    const moodEl = document.getElementById('codeboy-panel-mood');
    const energyEl = document.getElementById('codeboy-panel-energy');
    const xpEl = document.getElementById('codeboy-panel-xp');
    const statusEl = document.getElementById('codeboy-panel-status');
    if (levelEl) levelEl.textContent = String(snapshot.stats.level);
    if (moodEl) moodEl.textContent = String(Math.round(snapshot.stats.mood));
    if (energyEl) energyEl.textContent = String(Math.round(snapshot.stats.energy));
    if (xpEl) xpEl.textContent = `${snapshot.stats.xp}/${snapshot.nextLevelXp}`;
    if (statusEl) statusEl.textContent = `${snapshot.state.replaceAll('_', ' ')} · ${snapshot.language.displayName}`;
    document.getElementById('codeboy-panel-vibe')?.setAttribute('aria-pressed', String(snapshot.settings.vibeMode));
    document.getElementById('codeboy-panel-music')?.setAttribute('aria-pressed', String(snapshot.musicPlaying));
    const sleepButton = document.getElementById('codeboy-panel-sleep');
    sleepButton?.setAttribute('aria-pressed', String(snapshot.state === 'SLEEPING'));
    const sleepLabel = sleepButton?.querySelector('span');
    if (sleepLabel) sleepLabel.textContent = snapshot.state === 'SLEEPING' ? 'Проснуться' : 'Сон';

    // Show speech bubble if changed
    if (snapshot.bubble && snapshot.bubble !== lastBubble) {
      lastBubble = snapshot.bubble;
      showSpeechBubble(snapshot.bubble);
    } else if (!snapshot.bubble && speechEl.style.display !== 'none') {
      speechEl.style.display = 'none';
    }

    if (!manifest) return;

    // Determine animation
    const animName = snapshot.animation || 'idle';
    const animDef = manifest.character[animName] || manifest.character.idle;
    if (animDef) {
      void setAnimation(animDef);
    }
  }

  async function triggerAction(action: Action | string) {
    try {
      await fetch(`${activeBaseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        mode: 'cors',
      });

      // Quick visual feedback
      canvas.style.transform = 'scale(1.22) translateY(-6px)';
      setTimeout(() => {
        canvas.style.transform = '';
      }, 150);
    } catch {
      // ignore
    }
  }

  // 6. Connect to SSE
  function connectEvents() {
    const sse = new EventSource(`${activeBaseUrl}/events`);
    sse.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as Snapshot;
        handleSnapshot(snapshot);
      } catch {
        // ignore
      }
    };
    sse.addEventListener('toggle', () => {
      toggleVisibility();
    });
    sse.addEventListener('show', () => {
      showMascot();
    });
    sse.addEventListener('hide', () => {
      hideMascot();
    });
    sse.addEventListener('resetPosition', () => {
      resetPosition();
    });
    sse.onerror = () => {
      sse.close();
      setTimeout(async () => {
        await resolvePort();
        connectEvents();
      }, 3000);
    };
  }

  // Global window helpers
  try {
    (window as unknown as Record<string, unknown>).__CODE_BOY_TOGGLE__ = toggleVisibility;
    (window as unknown as Record<string, unknown>).__CODE_BOY_SHOW__ = showMascot;
    (window as unknown as Record<string, unknown>).__CODE_BOY_HIDE__ = hideMascot;
    (window as unknown as Record<string, unknown>).__CODE_BOY_RESET__ = resetPosition;
  } catch {
    // ignore
  }

  if ((window as unknown as Record<string, unknown>).__CODE_BOY_PENDING_SHOW__ === true) {
    (window as unknown as Record<string, unknown>).__CODE_BOY_PENDING_SHOW__ = false;
    showMascot();
  }

  // 7. Initialize
  async function start() {
    const ok = await resolvePort();
    if (!ok) {
      setTimeout(start, 2500);
      return;
    }
    await loadManifest();
    if (manifest) {
      // Preload core animations
      const coreKeys = ['idle', 'coding', 'dance', 'sleep', 'vibe', 'happy', 'error'];
      for (const k of coreKeys) {
        if (manifest.character[k]) void getImage(manifest.character[k].src);
      }
      for (const ef of Object.values(manifest.effects)) {
        void getImage(ef.src);
      }
      if (manifest.character.idle) {
        await setAnimation(manifest.character.idle);
      }
    }
    connectEvents();
  }

    void start().catch(error => {
      console.error('[Code Boy Floating] Startup failed:', error);
    });
  } catch (error) {
    // The overlay is optional UI. It must never abort workbench initialization.
    console.error('[Code Boy Floating] Initialization failed:', error);
  }
})();
