import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { CBDashboardData, CBWelcomeData } from '../types';

/** Shared webview utilities for ContextBack panels. */
export function nonce(): string {
  return randomBytes(16).toString('base64');
}

export function cspMeta(webview: vscode.Webview, n: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:;">`;
}

export function dashboardHtml(webview: vscode.Webview, data: CBDashboardData): string {
  const n = nonce();
  const { project, branch, todayMinutes, weekMinutes, totalSessions, recentWork, openThreads, recentFiles, recentErrors, openTodos } = data;

  const workRows = recentWork.map(w =>
    `<tr><td>${esc(w.topic)}</td><td>${w.minutes}m</td></tr>`
  ).join('');

  const threadRows = openThreads.map(t => {
    const dot = t.signal === 'red' ? '🔴' : t.signal === 'yellow' ? '🟡' : '🟢';
    return `<tr><td>${dot} ${esc(t.title)}</td><td>${esc(t.lastError || '—')}</td><td>${relTime(t.lastTouched)}</td></tr>`;
  }).join('');

  const todoRows = openTodos.map(t =>
    `<tr><td>□</td><td>${esc(t.tag)}</td><td>${esc(t.text)}</td></tr>`
  ).join('');

  const errorRows = recentErrors.map(e =>
    `<tr><td>⚠</td><td>${esc(shortPath(e.file))}</td><td>${esc(e.message.slice(0, 60))}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">${cspMeta(webview, n)}<style>
    body{font-family:-apple-system,Segoe UI,system-ui,sans-serif;font-size:13px;padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);}
    h1{font-size:16px;margin:0 0 4px;}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin:20px 0 6px;}
    .row{display:flex;gap:24px;margin-bottom:12px;}
    .stat{display:flex;flex-direction:column;}
    .stat-value{font-size:22px;font-weight:600;}
    .stat-label{font-size:11px;color:var(--vscode-descriptionForeground);}
    table{width:100%;border-collapse:collapse;margin-bottom:6px;}
    td{padding:3px 6px;vertical-align:top;border-bottom:1px solid var(--vscode-widget-border);}
    button{margin-top:16px;padding:6px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;border-radius:3px;font-size:12px;}
    button:hover{background:var(--vscode-button-hoverBackground);}
    hr{border:none;border-top:1px solid var(--vscode-widget-border);margin:14px 0;}
    .muted{color:var(--vscode-descriptionForeground);}
  </style></head><body>
  <h1>ContextBack</h1>
  <div class="muted">${esc(project.name)} · ${esc(branch.name)}</div>
  <hr>
  <div class="row">
    <div class="stat"><span class="stat-value">${todayMinutes}m</span><span class="stat-label">Today</span></div>
    <div class="stat"><span class="stat-value">${Math.round(weekMinutes / 60)}h ${weekMinutes % 60}m</span><span class="stat-label">This week</span></div>
    <div class="stat"><span class="stat-value">${totalSessions}</span><span class="stat-label">Sessions</span></div>
  </div>
  ${recentWork.length ? `<h2>Recent work</h2><table>${workRows}</table>` : ''}
  ${openThreads.length ? `<h2>Open threads</h2><table>${threadRows}</table>` : ''}
  ${recentErrors.length ? `<h2>Recent errors</h2><table>${errorRows}</table>` : ''}
  ${openTodos.length ? `<h2>Open TODOs</h2><table>${todoRows}</table>` : ''}
  <button onclick="vscode.postMessage({command:'continue'})">Continue</button>
  <button onclick="vscode.postMessage({command:'summarize'})" style="margin-left:8px">Summarize session</button>
  <script nonce="${n}">const vscode=acquireVsCodeApi();</script>
  </body></html>`;
}

export function welcomeHtml(webview: vscode.Webview, data: CBWelcomeData): string {
  const n = nonce();
  const { project, branch, lastSession, hoursAgo, analysis, recentFiles, openErrors, openTodos, git } = data;
  const duration = lastSession.durationSecs >= 3600
    ? `${Math.floor(lastSession.durationSecs / 3600)}h ${Math.floor((lastSession.durationSecs % 3600) / 60)}m`
    : `${Math.floor(lastSession.durationSecs / 60)}m`;

  const topicLine = analysis && analysis.confidence >= 0.6
    ? `<div class="topic">🔐 ${esc(analysis.topic)}</div>`
    : '';

  const unfinished = analysis?.unfinished ?? openTodos.map(t => t.text);
  const todoHtml = unfinished.slice(0, 5).map(t => `<div class="todo-item">□ ${esc(t)}</div>`).join('');
  const errorHtml = openErrors.slice(0, 3).map(e => `<div class="error-item">⚠ ${esc(e.message.slice(0, 80))}</div>`).join('');
  const nextStep = analysis?.nextStep ?? '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">${cspMeta(webview, n)}<style>
    body{font-family:-apple-system,Segoe UI,system-ui,sans-serif;font-size:13px;padding:20px;max-width:400px;margin:0 auto;color:var(--vscode-foreground);background:var(--vscode-editor-background);}
    .card{border:1px solid var(--vscode-widget-border);border-radius:6px;padding:16px;}
    h2{margin:0 0 4px;font-size:15px;}
    .subtitle{color:var(--vscode-descriptionForeground);font-size:12px;margin-bottom:12px;}
    .topic{font-size:14px;font-weight:600;margin:10px 0;}
    .row{display:flex;gap:16px;margin:8px 0;}
    .stat{display:flex;flex-direction:column;}
    .stat-value{font-size:16px;font-weight:500;}
    .stat-label{font-size:11px;color:var(--vscode-descriptionForeground);}
    .section-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin:10px 0 4px;}
    .todo-item,.error-item{font-size:12px;padding:2px 0;}
    .error-item{color:var(--vscode-editorError-foreground);}
    .next-step{font-style:italic;font-size:12px;color:var(--vscode-descriptionForeground);margin:8px 0;}
    .buttons{display:flex;gap:8px;margin-top:14px;}
    button{padding:6px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;border-radius:3px;font-size:12px;}
    button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);}
    button:hover{opacity:.9;}
    hr{border:none;border-top:1px solid var(--vscode-widget-border);margin:10px 0;}
  </style></head><body>
  <div class="card">
    <h2>👋 Welcome back</h2>
    <div class="subtitle">${hoursAgo < 24 ? `${Math.round(hoursAgo)} hours` : `${Math.round(hoursAgo / 24)} days`} since your last session · ${duration}</div>
    ${topicLine}
    <hr>
    <div class="row">
      <div class="stat"><span class="stat-value">${esc(branch.name)}</span><span class="stat-label">Branch</span></div>
      <div class="stat"><span class="stat-value">${git?.changedFiles.length ?? 0}</span><span class="stat-label">Changed files</span></div>
      <div class="stat"><span class="stat-value">${git?.commits.length ?? 0}</span><span class="stat-label">Commits</span></div>
    </div>
    ${errorHtml ? `<div class="section-label">⚠ Last problems</div>${errorHtml}` : ''}
    ${todoHtml ? `<div class="section-label">TODO</div>${todoHtml}` : ''}
    ${nextStep ? `<div class="next-step">→ ${esc(nextStep)}</div>` : ''}
    <div class="buttons">
      <button onclick="vscode.postMessage({command:'continue'})">Continue</button>
      <button class="secondary" onclick="vscode.postMessage({command:'dismiss'})">Dismiss</button>
    </div>
  </div>
  <script nonce="${n}">const vscode=acquireVsCodeApi();</script>
  </body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
