import * as vscode from 'vscode';
import type { CBSidebarData, CBQualityCacheEntry } from '../types';
import { nonce, cspMeta } from './templates';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function qualityCard(kind: string, title: string, entry: CBQualityCacheEntry | null, enabled: boolean, reviewable: boolean): string {
  const result = entry?.result;
  const score = result && reviewable ? result.score : null;
  const label = !reviewable ? 'NO CODE' : !enabled ? 'BOB OFFLINE' : !entry ? 'SCANNING...' : !result ? 'UNAVAILABLE' : `${score}/100`;
  const tone = score === null ? 'quiet' : score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
  return `<article class="scan-card ${tone}">
    <div class="scan-top"><span class="scan-title">${esc(title)}</span><strong class="scan-score">${label}</strong></div>
    <div class="meter" aria-label="${esc(title)} score"><span style="width:${score ?? 0}%"></span></div>
    ${result && reviewable ? `<p class="scan-reason">${esc(result.rationale)}</p>
      ${result.findings.length ? `<details class="finding-details" data-scan="${kind}"><summary>VIEW ${result.findings.length} FINDINGS</summary><ul class="findings">${result.findings.map(f => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
      <div class="scan-time">BOB SCAN · ${esc(new Date(result.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>` : ''}
  </article>`;
}

export function sidebarHtml(data: CBSidebarData, webview: vscode.Webview, assets: { css?: string; sprite?: string } = {}): string {
  const n = nonce();
  const recap = data.recap;
  const sprite = assets.sprite ? `<div class="sprite" role="img" aria-label="Code Boy"><img src="${esc(assets.sprite)}" alt="" /></div>` : '<div class="sprite-fallback">CB</div>';
  const sources = recap.sources.length ? recap.sources.join(' + ') : 'NO DATA';
  const stats = [
    recap.minutes ? `${recap.minutes} MIN` : '',
    recap.commits.length ? `${recap.commits.length} COMMIT${recap.commits.length === 1 ? '' : 'S'}` : '',
    recap.tests.passed ? `${recap.tests.passed} TEST OK` : '',
    recap.tests.failed ? `${recap.tests.failed} TEST FAILED` : '',
  ].filter(Boolean);
  const fileRows = recap.files.map((file, index) => {
    const short = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
    return `<button class="file-row" data-file="${index}" title="${esc(file)}"><span>▸</span>${esc(short)}</button>`;
  }).join('');
  const threads = data.openThreads.slice(0, 3).map(thread =>
    `<div class="thread ${thread.signal}"><span class="thread-light"></span><div><strong>${esc(thread.title)}</strong>${thread.lastError ? `<small>${esc(thread.lastError)}</small>` : ''}</div></div>`
  ).join('');

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  ${cspMeta(webview, n)}${assets.css ? `<link rel="stylesheet" href="${esc(assets.css)}">` : ''}</head><body>
  <main class="device">
    <button class="back-link" id="back" aria-label="Back to Code Boy"><span aria-hidden="true">‹</span> BACK TO CODE BOY</button>
    <header class="brand"><div class="brand-mark">↶</div><div><span class="brand-name">Context<span>Back</span></span><small>YOUR DEV MEMORY</small></div></header>
    <div class="project-strip"><span class="status-light"></span><strong>${esc(data.project.name)}</strong><span class="branch">⎇ ${esc(data.branch.name)}</span></div>
    <section class="world-frame" aria-label="Yesterday's activity">
      <div class="world-top"><span>YESTERDAY / ${esc(recap.date)}</span><span>${recap.active ? '● SAVED' : '○ QUIET'}</span></div>
      <div class="world-scene">${sprite}<div class="speech">${recap.active ? 'I found your trail from yesterday!' : 'A quiet day. Your next adventure is ready!'}<i></i></div></div>
      <div class="world-bottom"><span class="tiny-light"></span> SOURCE: ${esc(sources)}</div>
    </section>
    <div class="section-heading"><h2>01 / YESTERDAY'S LOG</h2><span>${recap.changedFilesCount ? `${recap.changedFilesCount} FILES` : 'NO FILES'}</span></div>
    <section class="pixel-panel log-panel"><p class="recap-summary">${esc(recap.summary)}</p>
      ${stats.length ? `<div class="stat-strip">${stats.map(stat => `<span>${esc(stat)}</span>`).join('')}</div>` : ''}
      ${recap.areas.length ? `<div class="area-strip">${recap.areas.map(a => `<span>${esc(a.name)} <b>${a.count}</b></span>`).join('')}</div>` : ''}
      ${recap.commits.length ? `<div class="micro-heading">GIT COMMITS</div>${recap.commits.slice(0, 3).map(c => `<div class="commit-row"><span>◆</span>${esc(c)}</div>`).join('')}` : ''}
      ${fileRows ? `<div class="micro-heading">FILES TO REVISIT</div>${fileRows}` : ''}
      ${recap.nextStep ? `<div class="next-step"><small>NEXT MOVE</small><p>${esc(recap.nextStep)}</p></div>` : ''}
    </section>
    <div class="section-heading"><h2>02 / CODE SCAN</h2><span>IBM BOB</span></div>
    ${qualityCard('yesterday', "YESTERDAY'S CHANGES", data.yesterdayQuality, data.qualityEnabled, data.yesterdayReviewable)}
    ${qualityCard('current', 'CURRENT CODE SAMPLE', data.currentQuality, data.qualityEnabled, data.currentReviewable)}
    <p class="score-note">Scores describe only the code Bob reviewed. They are not a whole-project grade.</p>
    ${threads ? `<div class="section-heading"><h2>03 / OPEN THREADS</h2><span>${data.openThreads.length}</span></div><section class="pixel-panel threads">${threads}</section>` : ''}
    <div class="actions"><button id="refresh">↻ SCAN AGAIN</button><button id="dashboard">▣ DASHBOARD</button></div>
    <footer>CONTEXTBACK <span>◆</span> YOUR WORK, REMEMBERED</footer>
  </main>
  <script nonce="${n}">const vscode=acquireVsCodeApi();const state=vscode.getState()||{};document.querySelectorAll('[data-scan]').forEach(el=>{el.open=!!state[el.dataset.scan];el.addEventListener('toggle',()=>{state[el.dataset.scan]=el.open;vscode.setState(state)})});document.getElementById('back').addEventListener('click',()=>vscode.postMessage({command:'back'}));document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));document.getElementById('dashboard').addEventListener('click',()=>vscode.postMessage({command:'dashboard'}));document.querySelectorAll('[data-file]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({command:'openFile',index:Number(el.dataset.file)})));</script>
  </body></html>`;
}

export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'contextback.sidebar';
  private view: vscode.WebviewView | undefined;
  private files: string[] = [];
  private loading = false;
  private pending = false;
  private readonly registration: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getData: () => Promise<CBSidebarData | null>,
    private readonly onRefresh: () => Promise<void>,
    private readonly onDashboard: () => void,
    private readonly onOpen: () => void,
    private readonly onBack: () => void,
  ) {
    this.registration = vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, this);
  }

  isVisible(): boolean { return this.view?.visible ?? false; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media'), vscode.Uri.joinPath(this.extensionUri, 'assets')],
    };
    view.onDidDispose(() => { this.view = undefined; });
    view.onDidChangeVisibility(() => { if (view.visible) { this.refresh(); this.onOpen(); } });
    view.webview.onDidReceiveMessage((message: { command: string; index?: number }) => {
      if (message.command === 'back') this.onBack();
      if (message.command === 'refresh') void this.onRefresh();
      if (message.command === 'dashboard') this.onDashboard();
      if (message.command === 'openFile' && Number.isInteger(message.index)) {
        const file = this.files[message.index!];
        if (file) void vscode.window.showTextDocument(vscode.Uri.file(file));
      }
    });
    this.refresh();
    this.onOpen();
  }

  refresh(): void { if (this.loading) { this.pending = true; return; } void this.reload(); }

  private async reload(): Promise<void> {
    if (!this.view || this.loading) return;
    this.loading = true;
    try {
      const data = await this.getData();
      if (!this.view) return;
      this.files = data?.recap.files ?? [];
      const css = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'contextback.css')).toString();
      const sprite = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'character', 'idle', 'codeboy_idle.png')).toString();
      if (data) {
        this.view.webview.html = sidebarHtml(data, this.view.webview, { css, sprite });
      } else {
        const n = nonce();
        this.view.webview.html = `<!doctype html><html lang="en"><head>${cspMeta(this.view.webview, n)}<link rel="stylesheet" href="${css}"></head><body><main class="device"><button class="back-link" id="back">‹ BACK TO CODE BOY</button><div class="empty-project"><strong>NO PROJECT OPEN</strong><p>Open a folder to see yesterday's work and code scans.</p></div></main><script nonce="${n}">document.getElementById('back').addEventListener('click',()=>acquireVsCodeApi().postMessage({command:'back'}));</script></body></html>`;
      }
    } finally {
      this.loading = false;
      if (this.pending) { this.pending = false; this.refresh(); }
    }
  }

  dispose(): void { this.registration.dispose(); }
}
