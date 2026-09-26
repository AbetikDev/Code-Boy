
import { build, context } from 'esbuild';
const shared = { bundle: true, sourcemap: true, logLevel: 'info' };
const targets = [
  { ...shared, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] },
  { ...shared, entryPoints: ['webview/main.ts'], outfile: 'media/webview.js', platform: 'browser', format: 'iife', target: 'es2022' },
  { ...shared, entryPoints: ['webview/floatingOverlay.ts'], outfile: 'media/floatingOverlay.js', platform: 'browser', format: 'iife', target: 'es2022' }
];
if (process.argv.includes('--watch')) {
  for (const target of targets) await (await context(target)).watch();
} else await Promise.all(targets.map(target => build(target)));
