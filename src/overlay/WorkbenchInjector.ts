import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const INJECTION_START = '/* -- CODE-BOY-OVERLAY-START -- */';
export const INJECTION_END = '/* -- CODE-BOY-OVERLAY-END -- */';
const INJECTION_VERSION = '__CODE_BOY_NATIVE_MASCOT_V6__';

export class WorkbenchInjector {
  static getWorkbenchJsPath(): string | undefined {
    const appRoot = vscode.env.appRoot;
    const candidates = [
      path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
      path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.desktop.main.js'),
      path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.desktop.main.js'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Fallback: search within appRoot/out
    try {
      const outDir = path.join(appRoot, 'out');
      if (fs.existsSync(outDir)) {
        const found = findFileRecursively(outDir, 'workbench.desktop.main.js');
        if (found) return found;
      }
    } catch {
      // Ignore search errors
    }

    return undefined;
  }

  static isPatched(): boolean {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) return false;
    try {
      const content = fs.readFileSync(jsPath, 'utf8');
      return content.includes(INJECTION_START) && content.includes(INJECTION_VERSION) && content.includes('codeboy-floating-root');
    } catch {
      return false;
    }
  }

  static patch(extensionPath?: string): { success: boolean; error?: string } {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) {
      return { success: false, error: 'Could not locate VS Code workbench.desktop.main.js file.' };
    }

    try {
      const manifestPath = extensionPath ? path.join(extensionPath, 'assets', 'manifest.json') : undefined;
      if (!manifestPath || !fs.existsSync(manifestPath)) {
        return { success: false, error: 'Could not locate the Code Boy asset manifest.' };
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        character?: { idle?: { src?: string; frameWidth?: number; frameHeight?: number; frames?: number; fps?: number } };
      };
      const idle = manifest.character?.idle;
      if (!extensionPath || !idle?.src) {
        return { success: false, error: 'The Code Boy idle sprite is missing from the manifest.' };
      }
      const spritePath = path.join(extensionPath, idle.src);
      if (!fs.existsSync(spritePath)) {
        return { success: false, error: 'Could not locate the Code Boy idle sprite.' };
      }
      const spriteDataUrl = `data:image/png;base64,${fs.readFileSync(spritePath).toString('base64')}`;
      const frameWidth = idle.frameWidth ?? 64;
      const frameHeight = idle.frameHeight ?? 64;
      const frames = idle.frames ?? 1;
      const fps = idle.fps ?? 6;
      let content = fs.readFileSync(jsPath, 'utf8');
      if (content.includes(INJECTION_START)) {
        if (content.includes(INJECTION_VERSION) && content.includes('codeboy-floating-root')) {
          return { success: true }; // already patched with modern snippet
        }
        // Old snippet present - unpatch first to replace cleanly
        this.unpatch();
        content = fs.readFileSync(jsPath, 'utf8');
      }

      // Create backup if not already present
      const backupPath = `${jsPath}.codeboy.bak`;
      if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, content, 'utf8');
      }

      const snippet = `\n${INJECTION_START}
(function() {
  window.${INJECTION_VERSION} = true;
  window.__CODE_BOY_OVERLAY_INJECTED__ = true;
  var ROOT_ID = 'codeboy-floating-root';
  var VISIBILITY_KEY = 'codeboy_native_visible';
  var SIZE = 96;
  var GUTTER = 12;
  function editorRect() {
    var el = document.querySelector('.editor-group-container.active .monaco-editor, .part.editor .monaco-editor, #workbench\\.parts\\.editor, .part.editor');
    var rect = el && el.getBoundingClientRect();
    return rect && rect.width > SIZE && rect.height > SIZE ? rect : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  }
  function place(root, left, top) {
    var rect = editorRect();
    var x = Math.max(rect.left + GUTTER, Math.min(rect.right - SIZE - GUTTER, left));
    var y = Math.max(rect.top + GUTTER, Math.min(rect.bottom - SIZE - GUTTER, top));
    root.style.left = x + 'px'; root.style.top = y + 'px'; root.style.right = 'auto'; root.style.bottom = 'auto';
  }
  function ensureMascot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;
    if (!document.body) return null;
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.title = 'Code Boy — перетаскивай меня мышкой';
    Object.assign(root.style, { position: 'fixed', width: SIZE + 'px', height: SIZE + 'px', right: '28px', bottom: '30px', zIndex: '2147483647', cursor: 'grab', userSelect: 'none', touchAction: 'none', pointerEvents: 'auto', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,.45))' });
    var canvas = document.createElement('canvas');
    canvas.width = ${frameWidth}; canvas.height = ${frameHeight};
    Object.assign(canvas.style, { width: SIZE + 'px', height: SIZE + 'px', display: 'block', imageRendering: 'pixelated', background: 'transparent' });
    root.appendChild(canvas); document.body.appendChild(root);
    var context = canvas.getContext('2d');
    var image = new Image(); var frame = 0;
    image.onload = function() {
      function draw() { context.clearRect(0, 0, ${frameWidth}, ${frameHeight}); context.drawImage(image, frame * ${frameWidth}, 0, ${frameWidth}, ${frameHeight}, 0, 0, ${frameWidth}, ${frameHeight}); frame = (frame + 1) % ${frames}; }
      draw(); setInterval(draw, ${Math.round(1000 / fps)});
    };
    image.src = ${JSON.stringify(spriteDataUrl)};
    try { var saved = localStorage.getItem('codeboy_native_pos'); if (saved) { var pos = JSON.parse(saved); place(root, pos.left, pos.top); } } catch (_) {}
    var dragging = false, moved = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    root.addEventListener('pointerdown', function(e) { if (e.button !== 0) return; var rect = root.getBoundingClientRect(); dragging = true; moved = false; startX = e.clientX; startY = e.clientY; initialLeft = rect.left; initialTop = rect.top; root.style.cursor = 'grabbing'; root.setPointerCapture(e.pointerId); e.preventDefault(); });
    root.addEventListener('pointermove', function(e) { if (!dragging) return; var dx = e.clientX - startX, dy = e.clientY - startY; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true; if (moved) place(root, initialLeft + dx, initialTop + dy); });
    function finish(e) { if (!dragging) return; dragging = false; root.style.cursor = 'grab'; try { root.releasePointerCapture(e.pointerId); } catch (_) {} var rect = root.getBoundingClientRect(); try { localStorage.setItem('codeboy_native_pos', JSON.stringify({ left: rect.left, top: rect.top })); } catch (_) {} }
    root.addEventListener('pointerup', finish); root.addEventListener('pointercancel', finish);
    addEventListener('resize', function() { var rect = root.getBoundingClientRect(); place(root, rect.left, rect.top); });
    return root;
  }
  function rememberVisibility(visible) { try { localStorage.setItem(VISIBILITY_KEY, visible ? 'true' : 'false'); } catch (_) {} }
  function showMascot() { var root = ensureMascot(); if (root) { root.style.display = 'block'; rememberVisibility(true); if (root.animate) root.animate([{ transform: 'scale(.85)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180 }); } }
  function hideMascot() { var root = ensureMascot(); if (root) { root.style.display = 'none'; rememberVisibility(false); } }
  function toggleMascot() { var root = ensureMascot(); if (!root) return; if (getComputedStyle(root).display === 'none') showMascot(); else hideMascot(); }
  window.__CODE_BOY_SHOW__ = showMascot;
  window.__CODE_BOY_HIDE__ = hideMascot;
  window.__CODE_BOY_TOGGLE__ = toggleMascot;
  function boot() { ensureMascot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
${INJECTION_END}
`;

      // Refuse to modify the editor when the generated browser code is invalid.
      new Function(snippet);

      fs.writeFileSync(jsPath, content + snippet, 'utf8');
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM')) {
        return {
          success: false,
          error: 'Permission denied: Please run VS Code as Administrator once to enable floating overlay.'
        };
      }
      return { success: false, error: errorMsg };
    }
  }

  static unpatch(): { success: boolean; error?: string } {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) {
      return { success: false, error: 'Could not locate VS Code workbench.desktop.main.js file.' };
    }

    try {
      let content = fs.readFileSync(jsPath, 'utf8');
      if (!content.includes(INJECTION_START)) {
        return { success: true }; // not patched
      }

      const startIndex = content.indexOf(INJECTION_START);
      const endIndex = content.indexOf(INJECTION_END);

      if (startIndex !== -1 && endIndex !== -1) {
        const before = content.substring(0, startIndex);
        const after = content.substring(endIndex + INJECTION_END.length);
        content = before + after;
        fs.writeFileSync(jsPath, content, 'utf8');
      } else {
        // If markers corrupted, restore from backup if available
        const backupPath = `${jsPath}.codeboy.bak`;
        if (fs.existsSync(backupPath)) {
          const backupContent = fs.readFileSync(backupPath, 'utf8');
          fs.writeFileSync(jsPath, backupContent, 'utf8');
        }
      }
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM')) {
        return {
          success: false,
          error: 'Permission denied: Please run VS Code as Administrator to disable floating overlay.'
        };
      }
      return { success: false, error: errorMsg };
    }
  }
}

function findFileRecursively(dir: string, fileName: string, maxDepth = 4): string | undefined {
  if (maxDepth <= 0) return undefined;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const res = findFileRecursively(fullPath, fileName, maxDepth - 1);
        if (res) return res;
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined;
}
