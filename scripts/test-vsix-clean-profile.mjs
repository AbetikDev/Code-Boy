import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const vsixPath = path.join(root, 'code-boy-1.0.10.vsix');

console.log('=== Step 1: Checking VSIX package ===');
if (!fs.existsSync(vsixPath)) {
  console.log('Packaging code-boy-1.0.10.vsix...');
  execFileSync('npm', ['run', 'package'], { cwd: root, stdio: 'inherit', shell: true });
}

console.log('=== Step 2: Inspecting VSIX contents ===');
const lsOutput = execFileSync(
  'npx',
  ['@vscode/vsce', 'ls', '--readme-path', 'README.vscode.md', '--no-dependencies'],
  { cwd: root, encoding: 'utf8', shell: true }
);

const files = lsOutput.split(/\r?\n/).map(f => f.trim()).filter(Boolean);

const requiredFiles = [
  'dist/extension.js',
  'media/floatingOverlay.js',
  'media/webview.js',
  'media/contextback.css',
  'media/styles.css',
  'resources/windows-media.ps1',
  'assets/manifest.json',
];

for (const req of requiredFiles) {
  if (!files.some(f => f.includes(req))) {
    throw new Error(`VSIX is missing required runtime asset: ${req}`);
  }
}

const forbiddenPrefixes = ['.env', 'src/', 'test/', 'ui-tests/', 'node_modules/', '.vscode-test/'];
for (const forbidden of forbiddenPrefixes) {
  const leaked = files.filter(f => f.startsWith(forbidden) || f.includes('/' + forbidden));
  if (leaked.length > 0) {
    throw new Error(`VSIX contains forbidden/dev files: ${leaked.join(', ')}`);
  }
}
console.log(`✓ All ${requiredFiles.length} required assets present; 0 forbidden/dev files leaked.`);

console.log('=== Step 3: Installing in a clean VS Code profile ===');
let codeCmd = '';
const candidateDirs = [
  path.join(root, '.vscode-test', 'vscode-win32-x64-archive-1.139.1', 'bin', 'code.cmd'),
  path.join(root, '.vscode-test', 'vscode-linux-x64-archive-1.139.1', 'bin', 'code'),
  path.join(root, '.vscode-test', 'vscode-darwin-archive-1.139.1', 'bin', 'code'),
];

for (const cand of candidateDirs) {
  if (fs.existsSync(cand)) {
    codeCmd = cand;
    break;
  }
}

if (!codeCmd) {
  // Try system code
  const probe = spawnSync(process.platform === 'win32' ? 'code.cmd' : 'code', ['--version'], { shell: true });
  if (!probe.error && probe.status === 0) {
    codeCmd = process.platform === 'win32' ? 'code.cmd' : 'code';
  }
}

if (!codeCmd) {
  console.log('⚠ VS Code binary not found in .vscode-test or PATH. Skipping live clean profile installation.');
  process.exit(0);
}

const tmpExtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-clean-ext-'));
const tmpUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-clean-usr-'));

try {
  console.log(`Using VS Code CLI: ${codeCmd}`);
  console.log(`Disposable extensions directory: ${tmpExtDir}`);
  console.log(`Disposable user data directory: ${tmpUserDir}`);

  // 1. Install extension into clean directory
  const installResult = spawnSync(codeCmd, [
    '--extensions-dir', tmpExtDir,
    '--user-data-dir', tmpUserDir,
    '--install-extension', vsixPath,
  ], { encoding: 'utf8', shell: true });

  if (installResult.status !== 0) {
    throw new Error(`Failed to install VSIX into clean profile: ${installResult.stderr || installResult.stdout}`);
  }
  console.log('✓ VSIX successfully installed into clean profile.');

  // 2. List extensions to verify discovery
  const listResult = spawnSync(codeCmd, [
    '--extensions-dir', tmpExtDir,
    '--user-data-dir', tmpUserDir,
    '--list-extensions',
  ], { encoding: 'utf8', shell: true });

  const installedList = (listResult.stdout || '').toLowerCase();
  if (!installedList.includes('code-boy-local.code-boy')) {
    throw new Error(`code-boy-local.code-boy not found in installed extensions: ${installedList}`);
  }
  console.log('✓ Extension discovered as code-boy-local.code-boy in fresh profile.');

  // 3. Verify installed directory contents
  const installedFolders = fs.readdirSync(tmpExtDir);
  const extFolder = installedFolders.find(f => f.startsWith('code-boy-local.code-boy'));
  if (!extFolder) {
    throw new Error(`Installed extension directory not found in ${tmpExtDir}: ${installedFolders.join(', ')}`);
  }

  const extRoot = path.join(tmpExtDir, extFolder);
  for (const req of ['package.json', 'dist/extension.js', 'media/floatingOverlay.js', 'resources/windows-media.ps1']) {
    const full = path.join(extRoot, req);
    if (!fs.existsSync(full)) {
      throw new Error(`Installed extension missing expected file: ${req}`);
    }
  }
  console.log('✓ Verified installed package on disk has valid entrypoints and media assets.');
  console.log('=== VSIX CLEAN PROFILE SMOKE PASSED ===');
} finally {
  fs.rmSync(tmpExtDir, { recursive: true, force: true });
  fs.rmSync(tmpUserDir, { recursive: true, force: true });
}
