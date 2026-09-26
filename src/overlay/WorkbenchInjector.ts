import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const INJECTION_START = '/* -- CODE-BOY-OVERLAY-START -- */';
export const INJECTION_END = '/* -- CODE-BOY-OVERLAY-END -- */';
const INJECTION_VERSION = '__CODE_BOY_TRUSTED_OVERLAY_V8__';

export class WorkbenchInjector {
  static getWorkbenchJsPath(): string | undefined {
    const appRoot = vscode.env.appRoot;
    const candidates = [
      path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
      path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.desktop.main.js'),
      path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.desktop.main.js'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    try {
      const outDir = path.join(appRoot, 'out');
      if (fs.existsSync(outDir)) return findFileRecursively(outDir, 'workbench.desktop.main.js');
    } catch {
      // Ignore search errors.
    }
    return undefined;
  }

  static isPatched(): boolean {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) return false;
    try {
      const content = fs.readFileSync(jsPath, 'utf8');
      return content.includes(INJECTION_START)
        && content.includes(INJECTION_VERSION)
        && content.includes('codeboy-floating-panel');
    } catch {
      return false;
    }
  }

  static patch(extensionPath?: string): { success: boolean; error?: string } {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) return { success: false, error: 'Could not locate VS Code workbench.desktop.main.js file.' };
    try {
      const bundlePath = extensionPath ? path.join(extensionPath, 'media', 'floatingOverlay.js') : undefined;
      if (!bundlePath || !fs.existsSync(bundlePath)) {
        return { success: false, error: 'Could not locate the compiled Code Boy overlay.' };
      }
      const overlayBundle = fs.readFileSync(bundlePath, 'utf8');
      if (!overlayBundle.includes('codeboy-floating-panel')) {
        return { success: false, error: 'The compiled Code Boy overlay is out of date. Rebuild the extension first.' };
      }

      let content = fs.readFileSync(jsPath, 'utf8');
      if (content.includes(INJECTION_START)) {
        if (content.includes(INJECTION_VERSION) && content.includes('codeboy-floating-panel')) return { success: true };
        const clean = removeInjection(content);
        if (clean === undefined) return { success: false, error: 'The previous Code Boy injection is incomplete.' };
        content = clean;
      }

      const backupPath = `${jsPath}.codeboy.bak`;
      if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, content, 'utf8');
      const snippet = `\n${INJECTION_START}\nwindow.${INJECTION_VERSION} = true;\nsetTimeout(function codeBoySafeStart() {\n  try {\n${indent(overlayBundle, 4)}\n  } catch (error) {\n    console.error('[Code Boy Floating] Safe loader failed:', error);\n  }\n}, 0);\n${INJECTION_END}\n`;
      new Function(snippet);
      fs.writeFileSync(jsPath, content.trimEnd() + snippet, 'utf8');
      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      if (error.includes('EACCES') || error.includes('EPERM')) {
        return { success: false, error: 'Permission denied: run the editor as Administrator once to enable Code Boy.' };
      }
      return { success: false, error };
    }
  }

  static unpatch(): { success: boolean; error?: string } {
    const jsPath = this.getWorkbenchJsPath();
    if (!jsPath) return { success: false, error: 'Could not locate VS Code workbench.desktop.main.js file.' };
    try {
      const content = fs.readFileSync(jsPath, 'utf8');
      if (!content.includes(INJECTION_START)) return { success: true };
      const clean = removeInjection(content);
      if (clean === undefined) return { success: false, error: 'The Code Boy injection markers are incomplete.' };
      fs.writeFileSync(jsPath, clean, 'utf8');
      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      if (error.includes('EACCES') || error.includes('EPERM')) {
        return { success: false, error: 'Permission denied: run the editor as Administrator to disable Code Boy.' };
      }
      return { success: false, error };
    }
  }
}

function indent(source: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return source.split(/\r?\n/).map(line => prefix + line).join('\n');
}

function removeInjection(content: string): string | undefined {
  const start = content.indexOf(INJECTION_START);
  const end = content.indexOf(INJECTION_END, start + INJECTION_START.length);
  if (start < 0 || end < start) return undefined;
  return content.slice(0, start).trimEnd() + '\n' + content.slice(end + INJECTION_END.length).trimStart();
}

function findFileRecursively(dir: string, fileName: string, maxDepth = 4): string | undefined {
  if (maxDepth <= 0) return undefined;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = findFileRecursively(fullPath, fileName, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch {
    // Ignore read errors.
  }
  return undefined;
}
