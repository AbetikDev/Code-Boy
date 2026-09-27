/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { OverlayServer } from '../src/overlay/OverlayServer';

function listenPort(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const s = http.createServer((_req, res) => { res.end(); });
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

test('OverlayServer start throws error when all candidate ports 43821-43825 are busy', async () => {
  const ports = [43821, 43822, 43823, 43824, 43825];
  const blockers: http.Server[] = [];
  try {
    for (const port of ports) {
      blockers.push(await listenPort(port));
    }

    const mockContext = { extensionPath: process.cwd() } as unknown as import('vscode').ExtensionContext;
    const server = new OverlayServer(mockContext, () => {});

    await assert.rejects(
      async () => { await server.start(); },
      /All Code Boy overlay ports \(43821-43825\) are currently in use\./
    );

    server.dispose();
  } finally {
    for (const b of blockers) {
      await new Promise(r => b.close(r));
    }
  }
});

test('OverlayServer handles health check, action execution, bad JSON, and directory traversal safely', async () => {
  const actionsReceived: string[] = [];
  const mockContext = { extensionPath: process.cwd() } as unknown as import('vscode').ExtensionContext;
  const server = new OverlayServer(mockContext, action => {
    actionsReceived.push(String(action));
  });

  const port = await server.start();
  assert.ok(port >= 43821 && port <= 43825);

  try {
    // 1. Health check
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json() as { status: string; port: number };
    assert.equal(healthData.status, 'ok');
    assert.equal(healthData.port, port);

    // 2. Valid action
    const actionRes = await fetch(`http://127.0.0.1:${port}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pet' }),
    });
    assert.equal(actionRes.status, 200);
    const actionData = await actionRes.json() as { ok: boolean };
    assert.equal(actionData.ok, true);
    assert.deepEqual(actionsReceived, ['pet']);

    // 3. Invalid JSON action
    const badJsonRes = await fetch(`http://127.0.0.1:${port}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ action: "pet" ', // malformed
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonData = await badJsonRes.json() as { error: string };
    assert.equal(badJsonData.error, 'Invalid JSON');

    // 4. Directory traversal attempt
    const traversalRes = await fetch(`http://127.0.0.1:${port}/assets/../../package.json`);
    assert.equal(traversalRes.status, 404);

    // 5. Unknown route
    const unknownRes = await fetch(`http://127.0.0.1:${port}/some/random/route`);
    assert.equal(unknownRes.status, 404);
  } finally {
    server.dispose();
  }
});
