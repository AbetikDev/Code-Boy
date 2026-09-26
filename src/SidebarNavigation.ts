import * as vscode from 'vscode';

export type SidebarScreen = 'companion' | 'context';

/** Show exactly one of the two views in the shared Code Boy container. */
export async function openSidebarScreen(screen: SidebarScreen): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'codeBoy.screen', screen);
  await vscode.commands.executeCommand('workbench.view.extension.codeboy');
  await vscode.commands.executeCommand(screen === 'companion' ? 'codeBoy.companion.focus' : 'contextback.sidebar.focus');
}
