import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ActivityEvent, Snapshot } from '../../src/models/types';
import { BobShellProvider, resolveBobCommand } from '../../src/contextback/ai/BobShellProvider';
import { WorkbenchInjector } from '../../src/overlay/WorkbenchInjector';
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(predicate: () => boolean, timeout = 8_000): Promise<boolean> {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (predicate()) return true; await delay(150); }
  return predicate();
}
interface TestApi { getSnapshot(): Snapshot; dispatch(event: ActivityEvent): void }
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<TestApi>('code-boy-local.code-boy');
  assert.ok(extension, 'Extension discovered');
  await vscode.commands.executeCommand('codeBoy.open');
  assert.equal(extension.isActive, true, 'Contributed command activates the extension');
  const api = extension.exports;
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['open', 'pet', 'dance', 'toggleVibeMode', 'sleep', 'wakeUp', 'changeRoom', 'showStats', 'toggleMusicDetection', 'resetCharacter']) assert.ok(commands.includes(`codeBoy.${command}`), command);
  await delay(1500);
  assert.equal(api.getSnapshot().hasWorkspace, true);
  api.dispatch({ type: 'focus', focused: true });
  api.dispatch({ type: 'typing', characters: 8, languageId: 'typescript' });
  assert.ok(['CODING', 'VIBE_CODING'].includes(api.getSnapshot().state), 'Coding state responds');
  await vscode.commands.executeCommand('codeBoy.sleep');
  assert.equal(api.getSnapshot().state, 'SLEEPING');
  await vscode.commands.executeCommand('codeBoy.wakeUp');
  await vscode.commands.executeCommand('codeBoy.pet');
  assert.ok(['HAPPY', 'VERY_HAPPY'].includes(api.getSnapshot().state), 'Pet command responds');
  const root = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(root, `smoke-${process.pid}.ts`);
  await vscode.workspace.fs.writeFile(uri, Buffer.from('const answer = 42;\n'));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(1, 0), '// saved locally\n');
  await vscode.workspace.applyEdit(edit);
  const beforeSave = api.getSnapshot().daily.filesSaved;
  await document.save();
  assert.ok(api.getSnapshot().daily.filesSaved > beforeSave, 'Real document save tracked');
  const diagnostics = vscode.languages.createDiagnosticCollection('code-boy-smoke');
  diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Synthetic test error', vscode.DiagnosticSeverity.Error)]);
  assert.ok(await waitFor(() => api.getSnapshot().quality.diagnosticsErrors > 0), 'Real diagnostics detected');
  const beforeFix = api.getSnapshot().daily.errorsFixed;
  diagnostics.clear();
  assert.ok(await waitFor(() => api.getSnapshot().daily.errorsFixed > beforeFix), 'Real diagnostics change tracked');
  diagnostics.dispose();
  await vscode.commands.executeCommand('codeBoy.showStats');
  await vscode.commands.executeCommand('contextBack.openSidebar');
  await vscode.commands.executeCommand('contextback.sidebar.focus');
  await vscode.commands.executeCommand('codeBoy.open');
  await vscode.commands.executeCommand('contextBack.openSidebar');
  const bob = new BobShellProvider(extension.extensionPath);
  const shell = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'bob.cmd', '--version'], { timeout: 5000, windowsHide: true })
    : spawnSync(resolveBobCommand(), ['--version'], { timeout: 5000, windowsHide: true });
  const shellFound = !(shell.error && 'code' in shell.error && shell.error.code === 'ENOENT');
  let bobSummary = 'not attempted';
  if (bob.isAvailable() && shellFound) {
    bobSummary = await bob.summarize('Extension-host smoke test. No source code or paths. Return a brief JSON session summary.')
      ? 'returned' : 'unavailable';
  }
  console.log(`BOB SHELL HOST CHECK: key configured=${bob.isAvailable()}, CLI found=${shellFound}, summary=${bobSummary}`);
  const testInstall = path.resolve(extension.extensionPath, '.vscode-test') + path.sep;
  assert.ok(path.resolve(vscode.env.appRoot).toLowerCase().startsWith(testInstall.toLowerCase()),
    `Overlay patch smoke must use disposable VS Code test installation: ${vscode.env.appRoot} vs ${testInstall}`);
  const jsPath = WorkbenchInjector.getWorkbenchJsPath();
  const htmlPath = WorkbenchInjector.getWorkbenchHtmlPath();
  assert.ok(jsPath && htmlPath, 'Real VS Code workbench files found');
  const originalJs = fs.readFileSync(jsPath);
  const originalHtml = fs.readFileSync(htmlPath);
  const backupPath = `${jsPath}.codeboy.bak`;
  const hadBackup = fs.existsSync(backupPath);
  try {
    const patched = WorkbenchInjector.patch(extension.extensionPath);
    assert.equal(patched.success, true, patched.error);
    assert.equal(WorkbenchInjector.isPatched(), true, 'Real workbench patch detected');
  } finally {
    fs.writeFileSync(jsPath, originalJs);
    fs.writeFileSync(htmlPath, originalHtml);
    if (!hadBackup) fs.rmSync(backupPath, { force: true });
  }
  assert.equal(WorkbenchInjector.isPatched(), false, 'Disposable test installation restored');
  const health = await Promise.any([43821, 43822, 43823, 43824, 43825].map(async port => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) throw new Error(`port ${port} unavailable`);
    const body = await response.json() as { status?: string; appName?: string; pid?: number };
    if (body.status !== 'ok' || body.appName !== vscode.env.appName || body.pid !== process.pid)
      throw new Error(`port ${port} is not this Code Boy host`);
    return port;
  }));
  console.log(`CODE BOY OVERLAY HOST CHECK PASSED: test-installation patch, restore, and server on ${health}.`);

  // Verify real action requests to the overlay server trigger state transitions in VS Code
  const sleepRes = await fetch(`http://127.0.0.1:${health}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sleep' }),
  });
  assert.equal(sleepRes.status, 200);
  assert.ok(await waitFor(() => api.getSnapshot().state === 'SLEEPING'), 'Overlay sleep action transitions character state');

  const wakeRes = await fetch(`http://127.0.0.1:${health}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'wake' }),
  });
  assert.equal(wakeRes.status, 200);
  assert.ok(await waitFor(() => api.getSnapshot().state !== 'SLEEPING'), 'Overlay wake action restores character state');

  const vibeBefore = api.getSnapshot().settings.vibeMode;
  const vibeRes = await fetch(`http://127.0.0.1:${health}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vibe' }),
  });
  assert.equal(vibeRes.status, 200);
  assert.ok(await waitFor(() => api.getSnapshot().settings.vibeMode !== vibeBefore), 'Overlay vibe action toggles vibe mode');

  // Verify overlay server error handling on malformed JSON
  const badRes = await fetch(`http://127.0.0.1:${health}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ invalid: json ',
  });
  assert.equal(badRes.status, 400);

  // Verify pauseTracking command pauses tracking
  await vscode.commands.executeCommand('contextBack.pauseTracking');
  assert.equal(vscode.workspace.getConfiguration('contextBack').get('enabled'), false, 'pauseTracking command updates contextBack.enabled to false');
  // Re-enable for subsequent runs
  await vscode.workspace.getConfiguration('contextBack').update('enabled', true, vscode.ConfigurationTarget.Global);

  console.log('CODE BOY HOST SMOKE PASSED: activation, shared sidebar navigation, companion and ContextBack webviews, commands, coding, sleep, pet, document save, diagnostics, overlay actions, and pause tracking.');
}
