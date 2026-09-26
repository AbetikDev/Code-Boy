import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Action, Snapshot } from '../models/types';

export class OverlayServer implements vscode.Disposable {
  private server?: http.Server;
  private port = 43821;
  private readonly clients = new Set<http.ServerResponse>();
  private lastSnapshot?: Snapshot;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onAction: (action: Action | string) => void
  ) {}

  async start(): Promise<number> {
    const candidatePorts = [43821, 43822, 43823, 43824, 43825];

    for (const port of candidatePorts) {
      const started = await this.tryListen(port);
      if (started) {
        this.port = port;
        this.startHeartbeat();
        return port;
      }
    }

    throw new Error('All Code Boy overlay ports (43821-43825) are currently in use.');
  }

  getPort(): number {
    return this.port;
  }

  broadcast(snapshot: Snapshot): void {
    this.lastSnapshot = snapshot;
    const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  sendCustomEvent(event: string, data: Record<string, unknown> = {}): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    for (const client of this.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
    if (this.server) {
      try { this.server.close(); } catch { /* ignore */ }
      this.server = undefined;
    }
  }

  private tryListen(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.once('error', () => {
        try { server.close(); } catch { /* ignore */ }
        resolve(false);
      });
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        resolve(true);
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.disposed) return;
      for (const client of this.clients) {
        try { client.write(':keepalive\n\n'); } catch { this.clients.delete(client); }
      }
    }, 15000);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin || '*';
    const setCors = () => {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    };

    setCors();

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: this.port, appName: vscode.env.appName }));
      return;
    }

    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      res.write(':connected\n\n');
      if (this.lastSnapshot) {
        res.write(`data: ${JSON.stringify(this.lastSnapshot)}\n\n`);
      }
      this.clients.add(res);
      req.on('close', () => {
        this.clients.delete(res);
      });
      return;
    }

    if (pathname === '/bundle.js') {
      const bundlePath = path.join(this.context.extensionPath, 'media', 'floatingOverlay.js');
      if (!fs.existsSync(bundlePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('floatingOverlay.js not compiled yet');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(bundlePath).pipe(res);
      return;
    }

    if (pathname === '/manifest') {
      const manifestPath = path.join(this.context.extensionPath, 'assets', 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('manifest.json not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(manifestPath).pipe(res);
      return;
    }

    if (pathname.startsWith('/assets/')) {
      const subpath = pathname.slice('/assets/'.length);
      const safeAssetPath = path.normalize(path.join(this.context.extensionPath, 'assets', subpath));
      const assetsRoot = path.normalize(path.join(this.context.extensionPath, 'assets'));

      if (!safeAssetPath.startsWith(assetsRoot) || !fs.existsSync(safeAssetPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Asset not found');
        return;
      }

      const ext = path.extname(safeAssetPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.json' ? 'application/json' : 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(safeAssetPath).pipe(res);
      return;
    }

    if (pathname === '/action' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { action?: Action };
          if (parsed && typeof parsed.action === 'string') {
            this.onAction(parsed.action as Action);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}
