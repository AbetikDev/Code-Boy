import fs from 'node:fs';
import path from 'node:path';

const START = '/* -- CODE-BOY-OVERLAY-START -- */';
const END = '/* -- CODE-BOY-OVERLAY-END -- */';
const VERSION = '__CODE_BOY_TRUSTED_OVERLAY_V8__';
const overlayBundle = fs.readFileSync(path.resolve('media', 'floatingOverlay.js'), 'utf8');

if (!overlayBundle.includes('codeboy-floating-panel')) {
  throw new Error('media/floatingOverlay.js is out of date. Run npm run compile first.');
}

function removePreviousInjection(content) {
  const start = content.indexOf(START);
  const end = content.indexOf(END, start + START.length);
  if (start < 0) return content;
  if (end < start) throw new Error('The previous Code Boy injection is incomplete.');
  return content.slice(0, start).trimEnd() + '\n' + content.slice(end + END.length).trimStart();
}

function findWorkbenchFiles(root, depth = 6) {
  if (depth < 0 || !fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === 'workbench.desktop.main.js') result.push(fullPath);
    else if (entry.isDirectory()) result.push(...findWorkbenchFiles(fullPath, depth - 1));
  }
  return result;
}

const indent = (source, spaces) => {
  const prefix = ' '.repeat(spaces);
  return source.split(/\r?\n/).map(line => prefix + line).join('\n');
};
const snippet = `\n${START}\nwindow.${VERSION} = true;\nsetTimeout(function codeBoySafeStart() {\n  try {\n${indent(overlayBundle, 4)}\n  } catch (error) {\n    console.error('[Code Boy Floating] Safe loader failed:', error);\n  }\n}, 0);\n${END}\n`;
new Function(snippet);

const localAppData = process.env.LOCALAPPDATA ?? '';
const roots = [
  'D:\\Microsoft VS Code',
  path.join(localAppData, 'Programs', 'Microsoft VS Code'),
  path.join(localAppData, 'Programs', 'Antigravity IDE')
];
const files = [...new Set(roots.flatMap(root => findWorkbenchFiles(root)))];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const backup = `${file}.codeboy.bak`;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');
  const next = removePreviousInjection(original).trimEnd() + snippet;
  fs.writeFileSync(file, next, 'utf8');
  console.log(`${file} | ${next.includes(VERSION) && next.includes('codeboy-floating-panel') ? 'patched-v8' : 'failed'}`);
}

if (files.length === 0) {
  console.error('No VS Code-compatible workbench files found.');
  process.exitCode = 1;
}
