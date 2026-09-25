import * as vscode from 'vscode';
import { CodeBoyController } from './CodeBoyController';
import { ContextBackController } from './contextback/ContextBackController';
import { ActivityEvent } from './models/types';

let controller: CodeBoyController | undefined;
let contextBack: ContextBackController | undefined;

export function activate(context: vscode.ExtensionContext) {
  controller = new CodeBoyController(context);
  context.subscriptions.push(controller);

  contextBack = new ContextBackController(context);
  context.subscriptions.push(contextBack);

  return {
    getSnapshot: () => controller?.engine.snapshot(),
    // Test/development injection is never exposed in a packaged production host.
    ...(context.extensionMode !== vscode.ExtensionMode.Production ? { dispatch: (event: ActivityEvent) => controller?.engine.handle(event) } : {})
  };
}

export async function deactivate(): Promise<void> {
  if (!controller) return;
  await controller.flush();
  controller.dispose();
  controller = undefined;
  contextBack?.dispose();
  contextBack = undefined;
}
