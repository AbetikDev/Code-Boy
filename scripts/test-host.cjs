const path = require('node:path');
const fs = require('node:fs/promises');
const { runTests } = require('@vscode/test-electron');
(async () => {
  // The VS Code Electron binary must start as an app, even when this runner
  // inherited a Node-mode setting from the surrounding environment.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const root = path.resolve(__dirname, '..');
  const workspace = path.join(root, '.vscode-test', 'workspace');
  await fs.mkdir(workspace, { recursive: true });
  await runTests({
    ...(process.env.VSCODE_EXECUTABLE ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE } : {}),
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, '.test', 'test', 'host', 'index.js'),
    launchArgs: [workspace, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--user-data-dir=' + path.join(root, '.vscode-test', 'user-data'), '--extensions-dir=' + path.join(root, '.vscode-test', 'extensions')]
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
