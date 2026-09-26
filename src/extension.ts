import * as vscode from 'vscode';
import { CodeBoyController } from './CodeBoyController';
import { ContextBackController } from './contextback/ContextBackController';
import { ActivityEvent } from './models/types';
import { ContextBoyBridge } from './bridge/ContextBoyBridge';

let controller: CodeBoyController | undefined;
let contextBack: ContextBackController | undefined;
let bridge: ContextBoyBridge | undefined;

export function activate(context: vscode.ExtensionContext) {
  controller = new CodeBoyController(context);
  context.subscriptions.push(controller);

  contextBack = new ContextBackController(context);
  context.subscriptions.push(contextBack);
  bridge = new ContextBoyBridge(context, controller, contextBack);
  context.subscriptions.push(bridge);

  return {
    getSnapshot: () => controller?.engine.snapshot(),
    // Test/development injection is never exposed in a packaged production host.
    ...(context.extensionMode !== vscode.ExtensionMode.Production ? { dispatch: (event: ActivityEvent) => controller?.engine.handle(event) } : {})
  };
}

export async function deactivate(): Promise<void> {
  if (!controller) return;
  await controller.flush();
  bridge?.dispose();
  bridge = undefined;
  controller.dispose();
  controller = undefined;
  contextBack?.dispose();
  contextBack = undefined;
}
