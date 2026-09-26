import type { Action, AnimationDefinition, AssetManifest, Snapshot } from '../src/models/types';

(function initFloatingOverlay() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('codeboy-floating-root')) return;

  const candidatePorts = [43821, 43822, 43823, 43824, 43825];
  const MASCOT_SIZE = 84;
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
    #codeboy-floating-root:hover {
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
    #codeboy-floating-menu {
      position: absolute;
      bottom: 88px;
      right: 0;
      background: #181226;
      border: 1px solid #6b4c94;
      border-radius: 4px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6), 2px 2px 0 #0b0813;
      padding: 5px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 155px;
      z-index: 1000001;
      font-family: Consolas, "Courier New", monospace;
    }
    .codeboy-menu-header {
      font-size: 9px;
      font-weight: bold;
      color: #ffb667;
      padding: 3px 6px;
      border-bottom: 1px solid #38254f;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .codeboy-menu-action {
      background: #231936;
      color: #ded3f0;
      border: 1px solid #4a3469;
      border-radius: 2px;
      padding: 5px 8px;
      font-size: 11px;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.1s, color 0.1s;
    }
    .codeboy-menu-action:hover {
      background: #3e2860;
      color: #51e4ec;
      border-color: #51e4ec;
    }
    @keyframes codeboyPop {
      from { opacity: 0; transform: translateY(6px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  // 2. Build DOM
  const root = document.createElement('div');
  root.id = 'codeboy-floating-root';
  root.title = 'Code Boy · Кликни, чтобы погладить (перетаскивай мышкой)';

  const speechEl = document.createElement('div');
  speechEl.id = 'codeboy-floating-speech';
  speechEl.style.display = 'none';

  const canvas = document.createElement('canvas');
  canvas.id = 'codeboy-floating-canvas';
  canvas.width = 64;
  canvas.height = 64;

  const menuEl = document.createElement('div');
  menuEl.id = 'codeboy-floating-menu';
  menuEl.style.display = 'none';
  menuEl.innerHTML = `
    <div class="codeboy-menu-header">Code Boy Companion</div>
    <button class="codeboy-menu-action" data-action="pet">🐾 Погладить</button>
    <button class="codeboy-menu-action" data-action="dance">🎵 Потанцевать</button>
    <button class="codeboy-menu-action" data-action="vibe">⚡ Vibe Режим</button>
    <button class="codeboy-menu-action" data-action="sleep">💤 Спать / Проснуться</button>
    <button class="codeboy-menu-action" data-action="reset">📍 Сбросить позицию</button>
    <button class="codeboy-menu-action" data-action="hide">❌ Скрыть</button>
  `;

  root.appendChild(speechEl);
  root.appendChild(canvas);
  root.appendChild(menuEl);
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
    root.style.transform = 'scale(1.25) translateY(-8px)';
    setTimeout(() => {
      root.style.transform = '';
    }, 220);
    showSpeechBubble('Привет! Я тут! 🐾\nПеретаскивай меня куда хочешь!');
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
    if (menuEl.contains(e.target as Node)) return;

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
      menuEl.style.display = 'none';
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
      // Normal click! Pet Code Boy
      if (!menuEl.contains(e.target as Node)) {
        triggerAction('pet');
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

  // Double click -> Vibe mode
  root.addEventListener('dblclick', (e: MouseEvent) => {
    if (menuEl.contains(e.target as Node)) return;
    e.preventDefault();
    triggerAction('vibe');
  });

  // Right-click context menu
  root.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    menuEl.style.display = menuEl.style.display === 'none' ? 'flex' : 'none';
  });

  // Close context menu on outside click
  window.addEventListener('click', (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) {
      menuEl.style.display = 'none';
    }
  });

  menuEl.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    menuEl.style.display = 'none';

    if (action === 'reset') {
      resetPosition();
      return;
    }

    if (action === 'hide') {
      hideMascot();
      return;
    }

    if (action) {
      triggerAction(action as Action);
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

  async function triggerAction(action: Action) {
    try {
      await fetch(`${activeBaseUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        mode: 'cors',
      });

      // Quick visual feedback
      root.style.transform = 'scale(1.22) translateY(-6px)';
      setTimeout(() => {
        root.style.transform = '';
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

  void start();
})();
