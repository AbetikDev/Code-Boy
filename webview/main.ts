import { CHARACTER_STATES, ROOM_THEMES } from '../src/models/types';
import type { Action, AssetManifest, ClientMessage, HostMessage, RoomTheme, Snapshot } from '../src/models/types';
import { SpriteAnimator } from './SpriteAnimator';
import { Scene } from './Scene';
import { Sound } from './Sound';
import { startPreview } from './Preview';

declare const acquireVsCodeApi: undefined | (() => { postMessage(message: ClientMessage): void; getState(): unknown; setState(state: unknown): void });
const host = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => { const element = document.getElementById(id); if (!element) { throw new Error(`Missing interface element: ${id}`); } return element as T; };
let send: (message: ClientMessage) => void = message => host?.postMessage(message);
let snapshot: Snapshot | undefined;
let manifest: AssetManifest | undefined;
let scene: Scene | undefined;
let animator: SpriteAnimator | undefined;
let galleryAnimator: SpriteAnimator | undefined;
let hostVisible = true;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let tapTimer: ReturnType<typeof setTimeout> | undefined;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let activePanel: 'stats' | 'room' | 'gallery' | undefined;
let pendingPanel: 'stats' | 'room' | 'gallery' | undefined;
let pendingSnapshot: Snapshot | undefined;
let previousFocus: HTMLElement | undefined;
const sound = new Sound();
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const roomLevels: Record<RoomTheme, number> = { DEFAULT: 1, NIGHT: 1, RETRO_PC: 3, FOREST: 7, CYBER: 10, SPACE: 20 };
const roomNames: Record<RoomTheme, string> = { DEFAULT: 'Home sweet code', NIGHT: 'After hours', CYBER: 'Neon district', FOREST: 'Forest terminal', SPACE: 'Orbital station', RETRO_PC: '1998.called()' };

function icon(name: string): string { return `<img class="pixel-icon" data-icon="${name}" alt="" aria-hidden="true">`; }
function control(action: Action, label: string, sprite: string = action): string { return `<button class="pixel-button action-button" data-action="${action}" aria-label="${label.toLowerCase()} Code Boy" title="${label}">${icon(sprite)}<span>${label}</span></button>`; }

function mount(): void {
  $('app').innerHTML = `
    <main class="device" aria-label="Code Boy virtual companion">
      <div class="preview-banner" id="preview-banner" hidden>BROWSER PREVIEW <span>sample activity</span></div>

      <div class="compact-header">
        <button class="level-badge" id="level-button" aria-label="View stats"><span>LV.</span><strong id="level">01</strong></button>
        <div class="compact-vitals" aria-label="Companion vitals">
          <div class="cvital">${icon('heart')}<meter id="mood-meter" min="0" max="100" value="75" aria-label="Mood"></meter><span id="mood-value">75</span></div>
          <div class="cvital">${icon('energy')}<meter id="energy-meter" min="0" max="100" value="85" aria-label="Energy"></meter><span id="energy-value">85</span></div>
        </div>
        <span id="vibe-dot" class="vibe-dot" title="Vibe mode" aria-hidden="true"></span>
      </div>

      <section class="world-frame" aria-label="Code Boy's room">
        <div class="world-top"><span class="world-location"><span class="status-dot" id="status-dot"></span><span id="room-name">HOME SWEET CODE</span></span><span id="time-label">DAY / 01</span></div>
        <div class="speech-area"><p class="speech bubble-top" id="speech" role="status" aria-live="polite">assembling the little world...</p></div>
        <div class="stage" id="stage"><canvas id="scene" width="192" height="160" role="img" aria-label="Code Boy in a cozy pixel art coding room"></canvas><button id="character-target" class="character-target" aria-label="Click to interact. Hold for menu." title="Click to pet · Hold for actions"></button></div>
        <div class="world-bottom"><span class="state-label"><span class="state-marker" aria-hidden="true"></span><span id="state">BOOTING</span></span><span id="language" class="language-badge">LOCAL ONLY</span></div>
      </section>

      <button class="memory-link" id="open-contextback" aria-label="Open ContextBack project memory">
        <span class="memory-icon" aria-hidden="true">↶</span>
        <span class="memory-copy"><strong>CONTEXTBACK</strong><small>YESTERDAY'S WORK &amp; CODE SCAN</small></span>
        <span class="memory-arrow" aria-hidden="true">›</span>
      </button>
      <button class="memory-link overlay-link" id="toggle-overlay" type="button" aria-pressed="true">
        <span class="memory-icon" aria-hidden="true">★</span>
        <span class="memory-copy"><strong>FLOATING CODE BOY</strong><small id="overlay-label">ON · IN YOUR EDITOR</small></span>
        <span class="overlay-switch" aria-hidden="true"><span></span></span>
      </button>

      <div class="connection-note" id="connection-note" role="status" hidden></div>

      <div class="xp-strip"><div class="xp-heading"><span id="xp-label">LV.2</span><span id="xp-value">0 / 100 XP</span></div><progress id="xp-progress" max="100" value="0" aria-label="Experience toward next level"></progress></div>

      <button id="dev-toggle" aria-label="Open sprite development tools" hidden style="position:absolute;bottom:6px;right:8px;font-size:8px;padding:2px 5px;background:transparent;border:1px solid var(--edge);color:var(--muted)">DEV</button>
      <section id="debug-panel" class="debug-panel" aria-label="Development tools" hidden><div class="section-heading"><h2>SPRITE LAB</h2><span>DEVELOPMENT ONLY</span></div><label>State<select id="debug-state" aria-label="Preview character state">${CHARACTER_STATES.map(state => `<option value="${state}">${state}</option>`).join('')}</select></label><label>Mood<input id="debug-mood" type="range" min="0" max="100" value="75"></label><label>Energy<input id="debug-energy" type="range" min="0" max="100" value="85"></label><label>FPS<input id="debug-fps" type="range" min="4" max="12" value="8"><output id="debug-fps-value">8</output></label><div class="debug-actions"><button class="pixel-button" id="random-event">RANDOM EVENT</button><button class="pixel-button" data-panel="gallery">SPRITE GALLERY</button></div></section>
    </main>

    <!-- Pop-up action menu (shown on long-press / right-click of character) -->
    <div class="action-menu" id="action-menu" hidden role="menu" aria-label="Code Boy actions">
      <button class="am-btn" data-action="pet" role="menuitem">🐾 Pet</button>
      <button class="am-btn" data-action="music" role="menuitem" id="am-music">🎵 Music</button>
      <button class="am-btn" data-action="dance" role="menuitem">💃 Dance</button>
      <button class="am-btn" data-action="vibe" role="menuitem" id="am-vibe">⚡ Vibe</button>
      <button class="am-btn" data-action="sleep" role="menuitem" id="am-sleep">💤 Sleep</button>
      <button class="am-btn" data-action="play" role="menuitem">🎮 Play</button>
      <div class="am-sep"></div>
      <button class="am-btn" data-panel="stats" role="menuitem">📊 Stats</button>
      <button class="am-btn" data-panel="room" role="menuitem">🏠 Room</button>
      <button class="am-btn" id="am-settings" role="menuitem">⚙ Setup</button>
    </div>

    <div class="drawer-shade" id="drawer-shade" hidden></div>
    <section class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
      <div class="drawer-heading"><div><span class="eyebrow">CODE BOY / PERSONAL SPACE</span><h2 id="drawer-title">LITTLE STATS</h2></div><button class="close-button" id="close-drawer" aria-label="Close panel">×</button></div>
      <div id="drawer-content"></div>
    </section>
  `;
  $('preview-banner').hidden = !!host;
  // action buttons inside popup menu + any [data-action] elsewhere
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => { closeActionMenu(); action(button.dataset.action as Action); }));
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button => button.addEventListener('click', () => { closeActionMenu(); openPanel(button.dataset.panel as 'stats' | 'room' | 'gallery'); }));
  $('am-settings').addEventListener('click', () => { closeActionMenu(); sound.play(); send({ type: 'command', command: 'settings' }); });
  $('open-contextback').addEventListener('click', () => { sound.play(); send({ type: 'command', command: 'context' }); });
  $('toggle-overlay').addEventListener('click', () => { sound.play(); send({ type: 'command', command: 'toggleOverlay' }); });
  $('level-button').addEventListener('click', () => openPanel('stats'));
  $('close-drawer').addEventListener('click', closePanel);
  $('drawer-shade').addEventListener('click', closePanel);
  $('dev-toggle').addEventListener('click', () => { if (snapshot?.development) { $('debug-panel').hidden = !$('debug-panel').hidden; } });
  $('debug-state').addEventListener('change', event => send({ type: 'debug', state: (event.target as HTMLSelectElement).value as Snapshot['state'] }));
  for (const key of ['mood', 'energy'] as const) { $(`debug-${key}`).addEventListener('change', event => send({ type: 'debug', [key]: Number((event.target as HTMLInputElement).value) })); }
  $('debug-fps').addEventListener('input', event => { const fps = Number((event.target as HTMLInputElement).value); $('debug-fps-value').textContent = String(fps); animator?.setFPS(fps); galleryAnimator?.setFPS(fps); send({ type: 'debug', fps }); });
  $('random-event').addEventListener('click', () => send({ type: 'debug', random: true }));

  // Long-press / right-click on character → action menu
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  const charBtn = $('character-target');
  charBtn.addEventListener('pointerdown', () => {
    longPressTimer = setTimeout(() => { longPressTimer = undefined; openActionMenu(); }, 500);
  });
  charBtn.addEventListener('pointerup', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = undefined; } });
  charBtn.addEventListener('pointercancel', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = undefined; } });
  charBtn.addEventListener('contextmenu', event => { event.preventDefault(); openActionMenu(); });
  charBtn.addEventListener('click', event => {
    if (event.detail === 0) { action('pet'); return; }
    if (tapTimer) { clearTimeout(tapTimer); }
    tapTimer = setTimeout(() => action('look'), 240);
  });
  charBtn.addEventListener('dblclick', () => { if (tapTimer) { clearTimeout(tapTimer); } action('pet'); });

  // Close action menu on outside click
  document.addEventListener('click', event => {
    const menu = $('action-menu');
    if (!menu.hidden && !(event.target as HTMLElement).closest('#action-menu') && !(event.target as HTMLElement).closest('#character-target')) {
      closeActionMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!$('action-menu').hidden) { closeActionMenu(); return; } if (activePanel) { event.preventDefault(); closePanel(); } }
    if (event.key === 'Tab' && activePanel) {
      const controls = [...$('drawer').querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
}

function openActionMenu(): void {
  const menu = $('action-menu');
  const stage = $('stage');
  const rect = stage.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  menu.hidden = false;
  (menu.querySelector('.am-btn') as HTMLElement | null)?.focus();
  // Update labels
  if (snapshot) {
    const amSleep = document.getElementById('am-sleep');
    if (amSleep) amSleep.textContent = snapshot.state === 'SLEEPING' ? '☀ Wake' : '💤 Sleep';
    const amVibe = document.getElementById('am-vibe');
    if (amVibe) amVibe.textContent = snapshot.settings.vibeMode ? '⚡ Vibe ON' : '⚡ Vibe';
    const amMusic = document.getElementById('am-music');
    if (amMusic) amMusic.textContent = snapshot.musicPlaying ? '🎵 Music ON' : '🎵 Music';
  }
}

function closeActionMenu(): void {
  $('action-menu').hidden = true;
}

function action(requested: Action): void {
  if (!snapshot?.settings.enabled) { return; }
  const selected = requested === 'sleep' && snapshot?.state === 'SLEEPING' ? 'wake' : requested;
  sound.play(selected === 'pet' ? 'happy' : selected === 'sleep' ? 'sleep' : 'click');
  send({ type: 'action', action: selected });
}

function setIcons(): void {
  document.querySelectorAll<HTMLImageElement>('[data-icon]').forEach(img => { const asset = manifest?.icons[img.dataset.icon ?? '']; if (asset) { img.src = asset.src; } else { img.hidden = true; } });
}

async function initialize(assets: AssetManifest, initial: Snapshot): Promise<void> {
  manifest = assets;
  if (readyTimer) { clearTimeout(readyTimer); }
  scene?.dispose(); animator?.dispose();
  scene = new Scene($<HTMLCanvasElement>('scene'), $('stage'), assets);
  const activeScene = scene;
  await scene.load();
  if (scene !== activeScene) { return; }
  animator = new SpriteAnimator(assets.character, (animation, frame) => activeScene.draw(animation, frame));
  animator.onComplete(animation => {
    if (!animation.next && snapshot) {
      const fallback = snapshot.animation !== animation.name ? snapshot.animation : snapshot.state === 'VIBE_CODING' ? 'vibe_coding_loop' : snapshot.state === 'CODING' ? 'coding_loop' : snapshot.state === 'SLEEPING' ? 'sleep' : snapshot.musicPlaying ? 'music_loop' : 'idle';
      animator?.play(fallback, true);
    }
  });
  setIcons();
  update(pendingSnapshot ?? initial); pendingSnapshot = undefined;
  $('connection-note').hidden = true;
  syncVisibility();
  if (pendingPanel) { const panel = pendingPanel; pendingPanel = undefined; openPanel(panel); }
}

function update(next: Snapshot): void {
  const previous = snapshot; snapshot = next;
  sound.enabled = next.settings.soundEnabled;
  if (previous && next.stats.level > previous.stats.level) { sound.play('level'); }
  $('level').textContent = String(next.stats.level).padStart(2, '0');
  $('level-button').setAttribute('aria-label', `Level ${next.stats.level}. Open stats`);
  for (const key of ['mood', 'energy'] as const) { $<HTMLMeterElement>(`${key}-meter`).value = next.stats[key]; $(`${key}-value`).textContent = String(Math.round(next.stats[key])); }
  const bubble = !next.settings.enabled ? 'taking a little pause.' : !next.hasWorkspace ? 'open a project?' : next.bubble || (next.state === 'IDLE' ? 'nice to have you here.' : '');
  $('speech').textContent = bubble || '...';
  $('speech').className = `speech bubble-${next.bubbleKind.toLowerCase()}`;
  $('state').textContent = next.state.replaceAll('_', ' ');
  $('status-dot').classList.toggle('asleep', next.state === 'SLEEPING' || !next.settings.enabled);
  $('toggle-overlay').setAttribute('aria-pressed', String(next.settings.floatingOverlay));
  $('toggle-overlay').setAttribute('aria-label', `${next.settings.floatingOverlay ? 'Hide' : 'Show'} floating Code Boy`);
  $('overlay-label').textContent = next.settings.floatingOverlay ? 'ON · IN YOUR EDITOR' : 'OFF · CLICK TO SHOW';
  $('room-name').textContent = roomNames[next.room].toUpperCase();
  const now = new Date();
  const night = next.room === 'NIGHT' || now.getHours() >= 19 || now.getHours() < 7;
  $('time-label').textContent = `${night ? 'NIGHT' : 'DAY'} / ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('language').textContent = next.hasWorkspace ? next.language.displayName : 'NO PROJECT';
  $('language').style.setProperty('--language-color', next.language.color);
  const vibe = next.settings.vibeMode || next.state === 'VIBE_CODING';
  // Update vibe dot indicator in compact header
  const vibeDot = document.getElementById('vibe-dot');
  if (vibeDot) {
    vibeDot.classList.toggle('active', vibe || next.autoVibe);
    vibeDot.title = next.autoVibe ? 'Flow state AUTO' : vibe ? 'Vibe mode ON' : 'Vibe mode';
  }
  // Disable all action buttons when companion is paused
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => { button.disabled = !next.settings.enabled; });
  const previousThreshold = Math.max(0, Math.pow(next.stats.level - 1, 2) * 50);
  const xpMin = next.nextLevelXp > previousThreshold && next.stats.xp >= previousThreshold ? previousThreshold : 0;
  $<HTMLProgressElement>('xp-progress').max = Math.max(1, next.nextLevelXp - xpMin);
  $<HTMLProgressElement>('xp-progress').value = Math.max(0, next.stats.xp - xpMin);
  $('xp-value').textContent = `${next.stats.xp} / ${next.nextLevelXp} XP`;
  $('xp-label').textContent = `NEXT ADVENTURE / LV.${next.stats.level + 1}`;
  $('dev-toggle').hidden = !next.development;
  if (!next.development) { $('debug-panel').hidden = true; }
  $<HTMLSelectElement>('debug-state').value = next.state;
  scene?.update(next);
  const animation = !next.hasWorkspace && next.state === 'IDLE' ? 'no_workspace' : next.animation;
  if (!previous || previous.animation !== next.animation || previous.hasWorkspace !== next.hasWorkspace) { animator?.play(animation, true); }
  if (!previous || previous.settings.animationSpeed !== next.settings.animationSpeed) { animator?.setSpeed(next.settings.animationSpeed); }
  animator?.setReducedMotion(motionPreference.matches || next.settings.reducedMotion || !next.settings.animations || !next.settings.enabled);
  planIdle();
  if (activePanel === 'stats') { renderStats(); }
  if (activePanel === 'room' && (!previous || previous.room !== next.room || previous.stats.level !== next.stats.level)) { renderRooms(); }
}

function planIdle(): void {
  if (host) { return; }
  if (idleTimer) { return; }
  if (!snapshot || snapshot.state !== 'IDLE' || !snapshot.settings.idleAnimations || !snapshot.settings.animations || snapshot.settings.reducedMotion || motionPreference.matches || !hostVisible || document.hidden) { return; }
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (snapshot?.state === 'IDLE' && snapshot.settings.idleAnimations && hostVisible && !document.hidden && !snapshot.settings.reducedMotion && !motionPreference.matches) { animator?.random('idle_'); }
    planIdle();
  }, 7500 + Math.random() * 8500);
}

function syncVisibility(): void {
  const visible = hostVisible && !document.hidden;
  animator?.setVisible(visible); galleryAnimator?.setVisible(visible && activePanel === 'gallery');
  if (!visible && idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; }
  if (visible) { planIdle(); }
}

function openPanel(panel: 'stats' | 'room' | 'gallery'): void {
  if (!snapshot || (panel === 'gallery' && !snapshot.development)) { return; }
  previousFocus = document.activeElement as HTMLElement;
  activePanel = panel; $('drawer').hidden = false; $('drawer-shade').hidden = false;
  document.querySelector<HTMLElement>('.device')!.inert = true;
  $('drawer-title').textContent = { stats: 'LITTLE STATS', room: 'MAKE IT HOME', gallery: 'SPRITE GALLERY' }[panel];
  galleryAnimator?.dispose(); galleryAnimator = undefined;
  if (panel === 'stats') { renderStats(); } else if (panel === 'room') { renderRooms(); } else { renderGallery(); }
  $('close-drawer').focus();
}

function closePanel(): void {
  activePanel = undefined; $('drawer').hidden = true; $('drawer-shade').hidden = true;
  galleryAnimator?.dispose(); galleryAnimator = undefined;
  document.querySelector<HTMLElement>('.device')!.inert = false;
  previousFocus?.focus();
}

function statRow(label: string, value: number, type = ''): string {
  return `<div class="stat-row ${type}"><span>${label}</span><meter min="0" max="100" value="${Math.round(value)}" aria-label="${label}"></meter><strong>${Math.round(value)}</strong></div>`;
}

function iqDescription(iq: number): string {
  if (iq >= 96) return 'Peak performance. You\'re in the zone.';
  if (iq >= 88) return 'Sharp and focused. Keep the streak going.';
  if (iq >= 76) return 'Solid session. Deep work is paying off.';
  if (iq >= 60) return 'Warming up. More deep focus = higher IQ.';
  if (iq >= 40) return 'Needs more flow sessions. Step away from TikTok.';
  return 'Take a break. Rubber duck mode activated.';
}

function renderStats(): void {
  if (!snapshot) { return; }
  const { stats, daily } = snapshot;
  const iq = Math.round(stats.iq);
  const deepSessions = snapshot.deepFocusSessions;
  $('drawer-content').innerHTML = `
    <div class="stats-hero">${icon('level')}<span>LEVEL <strong>${String(stats.level).padStart(2, '0')}</strong></span><div><strong>${stats.xp} XP</strong><span>A LITTLE MORE EVERY DAY</span></div></div>

    <div class="stat-rows">
      ${statRow('HAPPINESS', stats.happiness, 'pink')}
      ${statRow('MOOD', stats.mood, 'pink')}
      ${statRow('ENERGY', stats.energy, 'yellow')}
      ${statRow('FOCUS', stats.focus, 'cyan')}
      ${statRow('BOREDOM', stats.boredom, 'muted')}
    </div>

    <div class="iq-section">
      <div class="section-heading"><h3>IQ SYSTEM</h3><span>BRAIN POWER</span></div>
      <div class="iq-card" aria-label="IQ score ${iq}">
        <div class="iq-left">
          <span class="iq-value">${iq}</span>
          <span class="iq-label">${snapshot.iqLabel}</span>
        </div>
        <div class="iq-right">
          <div class="iq-bar-wrap"><meter min="0" max="100" value="${iq}" aria-label="IQ meter"></meter></div>
          <p class="iq-desc">${iqDescription(iq)}<br>Rises during deep focus. Falls during AFK.</p>
        </div>
      </div>
      <div class="deep-focus-row">
        <div><span class="deep-focus-count">${deepSessions}</span></div>
        <div style="text-align:right"><span class="deep-focus-label">DEEP FOCUS SESSIONS<br>THIS DEVICE</span></div>
      </div>
    </div>

    <div class="section-heading" style="margin-top:16px"><h3>TODAY</h3><span>JUST FOR YOU</span></div>
    <div class="daily-grid">
      <div><strong>${Math.floor(daily.codingSeconds / 3600)}<small>h</small> ${Math.floor(daily.codingSeconds % 3600 / 60)}<small>m</small></strong><span>CODING TOGETHER</span></div>
      <div><strong>${daily.filesSaved}</strong><span>FILES SAVED</span></div>
      <div><strong>${daily.errorsFixed}</strong><span>BUGS FIXED</span></div>
      <div><strong>${daily.buildsCompleted}</strong><span>BUILDS DONE</span></div>
    </div>

    <p class="streak-note">${icon('coffee')} ${snapshot.streak} DAY${snapshot.streak === 1 ? '' : 'S'} OF LITTLE ADVENTURES</p>
    <p class="quiet-note">Saved on this device. Your code and filenames stay yours.</p>

    <div class="section-heading"><h3>COLLECTED</h3><span>${snapshot.unlockedItems.length} ITEMS</span></div>
    <div class="collectibles">${snapshot.unlockedItems.length ? snapshot.unlockedItems.map(item => `<span class="collectible">${escapeHtml(item.replaceAll('_', ' '))}</span>`).join('') : '<p class="quiet-note">Your first coffee mug unlocks at level 2.</p>'}</div>
  `;
  setIcons();
}

function renderRooms(): void {
  if (!snapshot || !manifest) { return; }
  $('drawer-content').innerHTML = `<p class="drawer-intro">A tiny place to make big things.</p><div class="room-list">${ROOM_THEMES.map(room => {
    const locked = snapshot!.stats.level < roomLevels[room]; const selected = snapshot!.room === room; const asset = manifest!.room[`theme_${room.toLowerCase()}`];
    return `<button class="room-option ${selected ? 'selected' : ''}" data-room="${room}" ${locked ? 'disabled' : ''} aria-pressed="${selected}" aria-label="${roomNames[room]}${locked ? `, unlocks at level ${roomLevels[room]}` : ''}"><div class="room-thumbnail">${asset ? `<img src="${asset.src}" alt="${roomNames[room]} pixel room">` : ''}</div><div class="room-option-copy"><strong>${roomNames[room]}</strong><span>${locked ? `LOCKED / LV.${roomLevels[room]}` : selected ? 'YOUR CURRENT ROOM' : room === 'DEFAULT' ? 'FOLLOWS DAY & NIGHT' : 'READY TO MOVE IN'}</span></div><span class="room-check" aria-hidden="true">${selected ? '◆' : locked ? '×' : '+'}</span></button>`;
  }).join('')}</div><p class="quiet-note">New rooms arrive as you level up. No rush.</p>`;
  $('drawer-content').querySelectorAll<HTMLButtonElement>('[data-room]').forEach(button => button.addEventListener('click', () => { sound.play(); send({ type: 'room', room: button.dataset.room as RoomTheme }); }));
}

function renderGallery(): void {
  if (!manifest || !snapshot?.development) { return; }
  $('drawer-content').innerHTML = `<p class="drawer-intro">${Object.keys(manifest.character).length} original animations. Crisp at every frame.</p><label class="gallery-select">ANIMATION<select id="gallery-select">${Object.keys(manifest.character).map(name => `<option value="${name}">${name}</option>`).join('')}</select></label><div class="gallery-stage"><canvas id="gallery-canvas" width="64" height="64" aria-label="Selected animated sprite"></canvas></div><div class="gallery-metadata" id="gallery-metadata"></div><div class="debug-actions"><button class="pixel-button" id="gallery-play">PLAY</button><button class="pixel-button" id="gallery-pause">PAUSE</button><button class="pixel-button" id="gallery-preview">IN ROOM</button></div><div class="section-heading"><h3>SPRITE SHEET</h3><span>1× PIXELS</span></div><div class="sheet-scroll"><img id="gallery-sheet" alt="Complete selected sprite sheet"></div><p class="quiet-note">Frame clock sleeps between draws. Hidden views stop animation completely.</p>`;
  const canvas = $<HTMLCanvasElement>('gallery-canvas'); const ctx = canvas.getContext('2d')!;
  let image = new Image(); let selected = 'idle';
  galleryAnimator?.dispose();
  galleryAnimator = new SpriteAnimator(manifest.character, (animation, frame) => { ctx.clearRect(0, 0, 64, 64); ctx.imageSmoothingEnabled = false; if (image.complete && image.naturalWidth > 0) { ctx.drawImage(image, frame * animation.frameWidth, 0, animation.frameWidth, animation.frameHeight, 0, 0, 64, 64); } });
  const select = (): void => {
    selected = $<HTMLSelectElement>('gallery-select').value;
    const definition = manifest!.character[selected];
    if (!definition) { return; }
    galleryAnimator?.pause(); image = new Image();
    image.onload = () => galleryAnimator?.play(selected, true); image.src = definition.src;
    $<HTMLImageElement>('gallery-sheet').src = definition.src;
    $('gallery-metadata').textContent = `${definition.frames} FRAMES / ${definition.fps} FPS / ${definition.frameWidth} × ${definition.frameHeight} / ${definition.rarity ?? 'COMMON'}`;
  };
  $('gallery-select').addEventListener('change', select);
  $('gallery-play').addEventListener('click', () => galleryAnimator?.play());
  $('gallery-pause').addEventListener('click', () => galleryAnimator?.pause());
  $('gallery-preview').addEventListener('click', () => { send({ type: 'debug', animation: selected }); closePanel(); });
  select();
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }

function showError(message: string): void {
  $('speech').textContent = 'loose cable. one second.';
  $('connection-note').textContent = message; $('connection-note').hidden = false;
  $('state').textContent = 'CONNECTION CHECK';
  animator?.play('error_loading', true);
}

function receive(message: HostMessage): void {
  if (!message || typeof message !== 'object') { return; }
  switch (message.type) {
    case 'init': void initialize(message.manifest, message.snapshot).catch(error => showError(error instanceof Error ? error.message : 'Could not load Code Boy.')); break;
    case 'snapshot': if (animator) { update(message.snapshot); } else { pendingSnapshot = message.snapshot; } break;
    case 'visibility': hostVisible = message.visible; syncVisibility(); break;
    case 'panel': if (snapshot) { openPanel(message.panel); } else { pendingPanel = message.panel; } break;
    case 'error': showError(message.message); break;
  }
}

mount();
document.addEventListener('visibilitychange', syncVisibility);
motionPreference.addEventListener('change', () => { if (snapshot) { update(snapshot); } });
window.addEventListener('message', event => { if (host) { receive(event.data as HostMessage); } });
window.addEventListener('pagehide', () => { scene?.dispose(); animator?.dispose(); galleryAnimator?.dispose(); sound.dispose(); if (idleTimer) { clearTimeout(idleTimer); } if (readyTimer) { clearTimeout(readyTimer); } if (tapTimer) { clearTimeout(tapTimer); } });
if (host) {
  send({ type: 'ready' });
  readyTimer = setTimeout(() => { if (!snapshot) { showError('Code Boy is waiting for the extension host. Reopen this view to reconnect.'); } }, 12000);
} else {
  void startPreview(receive).then(previewSend => { send = previewSend; }).catch(error => showError(error instanceof Error ? error.message : 'Could not start browser preview.'));
}
