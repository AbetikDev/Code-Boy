import * as vscode from 'vscode';
import { CodeBoyEngine } from './core/CodeBoyEngine';
import { Action, ClientMessage, ROOM_THEMES, RoomTheme } from './models/types';
import { MusicController, SPOTIFY_TOKEN_KEY } from './music/MusicController';
import { StateStore } from './StateStore';
import { DiagnosticsTracker } from './vscode/DiagnosticsTracker';
import { EditorTracker } from './vscode/EditorTracker';
import { readSettings, updateSetting } from './vscode/Settings';
import { TaskTracker } from './vscode/TaskTracker';
import { CodeBoyViewProvider } from './webview/CodeBoyViewProvider';
import { OverlayServer } from './overlay/OverlayServer';
import { WorkbenchInjector } from './overlay/WorkbenchInjector';

export class CodeBoyController implements vscode.Disposable {
  readonly engine: CodeBoyEngine;
  private readonly store: StateStore;
  private readonly view: CodeBoyViewProvider;
  private readonly music: MusicController;
  private readonly overlayServer: OverlayServer;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly output = vscode.window.createOutputChannel('Code Boy');
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly saveTimer: ReturnType<typeof setInterval>;
  private statusBarItem?: vscode.StatusBarItem;
  private disposed = false;
  private dirty = false;
  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new StateStore(context.globalState);
    const settings = readSettings();
    this.engine = new CodeBoyEngine(this.store.read(), settings, {
      development: context.extensionMode !== vscode.ExtensionMode.Production,
      hasWorkspace: Boolean(vscode.workspace.workspaceFolders?.length)
    });
    this.view = new CodeBoyViewProvider(
      context,
      this.engine,
      message => this.run(this.receive(message)),
      () => this.handleActivityBarClick()
    );
    this.music = new MusicController(context, (playing, status) => this.engine.setMusic(playing, status));
    this.overlayServer = new OverlayServer(context, action => this.run(this.act(action)));
    const emit = this.engine.handle.bind(this.engine);
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(heart) Code Boy';
    this.statusBarItem.tooltip = 'Code Boy · Плавающий персонаж (кликните, чтобы показать/скрыть)';
    this.statusBarItem.command = 'codeBoy.toggleFloatingOverlay';
    this.statusBarItem.show();

    this.disposables.push(
      this.output, this.engine, this.view, this.music, this.overlayServer, this.statusBarItem,
      vscode.window.registerWebviewViewProvider(CodeBoyViewProvider.viewType, this.view, { webviewOptions: { retainContextWhenHidden: true } }),
      new EditorTracker(emit), new DiagnosticsTracker(emit), new TaskTracker(emit),
      this.engine.onChange(snapshot => {
        this.dirty = true;
        this.overlayServer.broadcast(snapshot);
        if (this.statusBarItem) {
          const icon = snapshot.state === 'CODING' ? '$(keyboard)' : snapshot.state === 'DANCING' || snapshot.musicPlaying ? '$(music)' : snapshot.state === 'SLEEPING' ? '$(moon)' : '$(heart)';
          this.statusBarItem.text = `${icon} Code Boy (Lv.${snapshot.stats.level})`;
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.engine.setWorkspace(Boolean(vscode.workspace.workspaceFolders?.length))),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('codeBoy')) {
          const next = readSettings();
          this.engine.updateSettings(next);
          this.run(this.music.configure(next));
          this.overlayServer.sendCustomEvent(next.floatingOverlay ? 'show' : 'hide');
        }
      })
    );
    this.timer = setInterval(() => this.engine.tick(), 1000);
    this.saveTimer = setInterval(() => { if (this.dirty) this.run(this.flush()); }, 30000);
    this.registerCommands();
    this.run(vscode.commands.executeCommand('setContext', 'codeBoy.development', context.extensionMode !== vscode.ExtensionMode.Production));
    this.run(this.music.configure(settings));
    this.overlayServer.start()
      .then(() => this.overlayServer.broadcast(this.engine.snapshot()))
      .catch(err => this.output.appendLine('[Code Boy] Overlay server note: ' + err));

    // The editor overlay is the primary Code Boy surface.
    if (settings.floatingOverlay && !WorkbenchInjector.isPatched()) {
      WorkbenchInjector.patch(this.context.extensionPath);
    }
  }
  private run(work: PromiseLike<unknown>): void {
    void Promise.resolve(work).catch(() => this.output.appendLine('A Code Boy operation could not complete. Check that VS Code settings and local storage are writable.'));
  }
  private registerCommands(): void {
    const command = (name: string, handler: () => unknown) => this.disposables.push(vscode.commands.registerCommand(`codeBoy.${name}`, handler));
    command('open', () => this.open());
    command('pet', () => this.act('pet'));
    command('dance', () => this.act('dance'));
    command('toggleVibeMode', () => this.act('vibe'));
    command('sleep', () => this.act('sleep'));
    command('wakeUp', () => this.act('wake'));
    command('changeRoom', () => this.chooseRoom());
    command('showStats', async () => { await this.open(); this.view.showStats(); });
    command('toggleMusicDetection', () => updateSetting('musicDetection', !readSettings().musicDetection));
    command('resetCharacter', async () => {
      const answer = await vscode.window.showWarningMessage('Reset Code Boy’s level, stats, streak, and cosmetic unlocks on this device?', { modal: true }, 'Reset Character');
      if (answer === 'Reset Character') { this.engine.reset(); await updateSetting('roomTheme', 'DEFAULT'); await this.flush(); }
    });
    command('connectSpotify', () => this.connectSpotify());
    command('disconnectSpotify', async () => {
      await this.context.secrets.delete(SPOTIFY_TOKEN_KEY);
      await this.music.configure(readSettings());
      void vscode.window.showInformationMessage('Spotify disconnected. Manual MUSIC is always available.');
    });
    command('spriteGallery', async () => {
      if (this.context.extensionMode === vscode.ExtensionMode.Production) return;
      await this.open(); this.view.showGallery();
    });
    command('enableFloatingOverlay', async () => {
      await updateSetting('floatingOverlay', true);
      const result = WorkbenchInjector.patch(this.context.extensionPath);
      if (!result.success) {
        void vscode.window.showErrorMessage(`Code Boy: ${result.error ?? 'Could not enable floating overlay'}`);
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'Code Boy: Floating mascot overlay enabled! Reload the window to see Code Boy in the bottom-right corner.',
        'Reload Window', 'Later'
      );
      if (choice === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
    command('disableFloatingOverlay', async () => {
      await updateSetting('floatingOverlay', false);
      const result = WorkbenchInjector.unpatch();
      if (!result.success) {
        void vscode.window.showErrorMessage(`Code Boy: ${result.error ?? 'Could not disable floating overlay'}`);
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        'Code Boy: Floating mascot overlay disabled. Reload window to apply changes.',
        'Reload Window', 'Later'
      );
      if (choice === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
    command('toggleFloatingOverlay', async () => {
      if (!WorkbenchInjector.isPatched()) {
        const result = WorkbenchInjector.patch(this.context.extensionPath);
        if (result.success) {
          const choice = await vscode.window.showInformationMessage(
            'Code Boy: Плавающий персонаж активирован! Перезагрузите окно, чтобы он появился в правом нижнем углу поверх редактора.',
            'Перезагрузить окно', 'Позже'
          );
          if (choice === 'Перезагрузить окно') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        }
        return;
      }
      this.overlayServer.sendCustomEvent('toggle');
    });
    command('resetFloatingPosition', () => {
      this.overlayServer.sendCustomEvent('resetPosition');
    });
    command('showFloatingOverlay', () => {
      this.overlayServer.sendCustomEvent('show');
    });
    command('hideFloatingOverlay', () => {
      this.overlayServer.sendCustomEvent('hide');
    });
  }
  private handleActivityBarClick(): void {
    if (!WorkbenchInjector.isPatched()) {
      const res = WorkbenchInjector.patch(this.context.extensionPath);
      if (res.success) {
        void vscode.window.showInformationMessage(
          'Code Boy: Плавающий персонаж активирован! Перезагрузите окно, чтобы он появился в правом нижнем углу.',
          'Перезагрузить окно'
        ).then(choice => {
          if (choice === 'Перезагрузить окно') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      }
      return;
    }
    this.overlayServer.sendCustomEvent('show');
  }
  private async open(): Promise<void> {
    if (!WorkbenchInjector.isPatched()) {
      const result = WorkbenchInjector.patch(this.context.extensionPath);
      if (!result.success) {
        void vscode.window.showErrorMessage(`Code Boy: ${result.error ?? 'Could not enable the editor mascot'}`);
        return;
      }
      await updateSetting('floatingOverlay', true);
      const choice = await vscode.window.showInformationMessage(
        'Code Boy готов жить прямо в редакторе. Перезагрузите окно, чтобы он появился.',
        'Перезагрузить окно', 'Позже'
      );
      if (choice === 'Перезагрузить окно') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
      return;
    }
    this.overlayServer.sendCustomEvent('show');
  }
  private async act(action: Action | string): Promise<void> {
    const knownActions: Action[] = ['pet', 'look', 'music', 'dance', 'sleep', 'wake', 'play', 'vibe'];
    if (knownActions.includes(action as Action)) {
      this.engine.action(action as Action);
      if (action === 'vibe') await updateSetting('vibeMode', this.engine.snapshot().settings.vibeMode);
    } else if (action === 'stats') {
      await this.open();
      this.view.showStats();
    } else if (action === 'room') {
      await this.chooseRoom();
    } else if (action === 'showOverlay') {
      this.overlayServer.sendCustomEvent('show');
    }
  }
  private async setRoom(room: RoomTheme): Promise<void> {
    this.engine.setRoom(room);
    await updateSetting('roomTheme', this.engine.snapshot().room);
  }
  private async chooseRoom(): Promise<void> {
    const levels: Record<RoomTheme, number> = { DEFAULT: 1, NIGHT: 1, RETRO_PC: 3, FOREST: 7, CYBER: 10, SPACE: 20 };
    const level = this.engine.snapshot().stats.level;
    const choice = await vscode.window.showQuickPick(ROOM_THEMES.map(room => ({
      label: room.replace('_', ' '), description: levels[room] > level ? `Unlocks at level ${levels[room]}` : room === this.engine.snapshot().room ? 'Current room' : 'Available', room
    })), { title: 'Code Boy · Choose a room' });
    if (choice && levels[choice.room] <= level) await this.setRoom(choice.room);
  }
  private async connectSpotify(): Promise<void> {
    const token = await vscode.window.showInputBox({ title: 'Optional Spotify connection', prompt: 'Paste a Spotify OAuth access token with user-read-playback-state scope. Stored in VS Code SecretStorage; expires according to Spotify.', password: true, ignoreFocusOut: true, validateInput: value => value.trim().length < 20 ? 'Enter a valid access token, or press Escape to cancel.' : undefined });
    if (!token) return;
    await this.context.secrets.store(SPOTIFY_TOKEN_KEY, token.trim());
    await updateSetting('musicDetection', true);
    await this.music.configure(readSettings());
  }
  private async receive(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'action': await this.act(message.action); break;
      case 'room': await this.setRoom(message.room); break;
      case 'debug': if (this.context.extensionMode !== vscode.ExtensionMode.Production) this.engine.debug(message); break;
      case 'command':
        if (message.command === 'stats') this.view.showStats();
        else if (message.command === 'room') this.view.showRoom();
        else if (message.command === 'gallery' && this.context.extensionMode !== vscode.ExtensionMode.Production) this.view.showGallery();
        else if (message.command === 'settings') await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:code-boy-local.code-boy');
        break;
      case 'ready': break;
    }
  }
  async flush(): Promise<void> { this.dirty = false; await this.store.save(this.engine.serialize()); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer); clearInterval(this.saveTimer);
    for (const disposable of [...this.disposables].reverse()) disposable.dispose();
  }
}
