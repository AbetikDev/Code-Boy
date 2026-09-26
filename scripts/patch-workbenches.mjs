import fs from 'node:fs';
import path from 'node:path';

const START = '/* -- CODE-BOY-OVERLAY-START -- */';
const END = '/* -- CODE-BOY-OVERLAY-END -- */';
const VERSION = '__CODE_BOY_NATIVE_MASCOT_V5__';

const manifest = JSON.parse(fs.readFileSync(path.resolve('assets', 'manifest.json'), 'utf8'));
const idle = manifest.character?.idle;
if (!idle?.src) throw new Error('Code Boy idle sprite is missing from assets/manifest.json.');

const spriteDataUrl = `data:image/png;base64,${fs.readFileSync(path.resolve(idle.src)).toString('base64')}`;
const frameWidth = idle.frameWidth ?? 64;
const frameHeight = idle.frameHeight ?? 64;
const frames = idle.frames ?? 1;
const fps = idle.fps ?? 6;

function injectedSource() {
  return `\n${START}
(function() {
  window.${VERSION} = true;
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
    try { var saved = localStorage.getItem('codeboy_native_pos'); if (saved) { var pos = JSON.parse(saved); place(root, pos.left, pos.top); } if (localStorage.getItem(VISIBILITY_KEY) === 'false') root.style.display = 'none'; } catch (_) {}
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMascot, { once: true }); else ensureMascot();
  document.addEventListener('click', function(e) {
    var target = e.target instanceof Element ? e.target : null;
    var bar = target && target.closest('#workbench\\.parts\\.activitybar, .part.activitybar');
    var action = target && target.closest('.action-item, [role="tab"], [role="button"]');
    if (!bar || !action) return;
    var labelled = action.querySelector('[aria-label], [title], [data-id]');
    var identity = [action.getAttribute('aria-label'), action.getAttribute('title'), action.getAttribute('data-id'), labelled && labelled.getAttribute('aria-label'), labelled && labelled.getAttribute('title'), labelled && labelled.getAttribute('data-id'), action.textContent].filter(Boolean).join(' ').toLowerCase();
    if (identity.indexOf('code boy') < 0 && identity.indexOf('workbench.view.extension.codeboy') < 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); toggleMascot();
  }, true);
})();
${END}
`;
}

function removePreviousInjection(content) {
  const start = content.indexOf(START);
  const end = content.indexOf(END);
  if (start < 0 || end < start) return content;
  return content.slice(0, start).trimEnd() + '\n' + content.slice(end + END.length).trimStart();
}

function findWorkbenchFiles(root, depth = 6) {
  if (depth < 0 || !fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === 'workbench.desktop.main.js') result.push(fullPath);
    else if (entry.isDirectory()) result.push(...findWorkbenchFiles(fullPath, depth - 1));
  }
  return result;
}

// Compile the browser snippet before touching either editor installation.
const snippet = injectedSource();
new Function(snippet);

const localAppData = process.env.LOCALAPPDATA ?? '';
const roots = [
  'D:\\Microsoft VS Code',
  path.join(localAppData, 'Programs', 'Microsoft VS Code'),
  path.join(localAppData, 'Programs', 'Antigravity IDE')
];
const files = [...new Set(roots.flatMap(root => findWorkbenchFiles(root)))];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const backup = `${file}.codeboy.bak`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');
  const next = removePreviousInjection(original) + snippet;
  fs.writeFileSync(file, next, 'utf8');
  console.log(`${file} | ${next.includes(VERSION) ? 'patched-v5' : 'failed'}`);
}

if (files.length === 0) {
  console.error('No VS Code-compatible workbench files found.');
  process.exitCode = 1;
}
