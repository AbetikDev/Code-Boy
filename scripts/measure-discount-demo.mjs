import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('demo/discount-bug');
const output = path.resolve('docs/ibm-bob/discount-before-after-measurement.json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'code-boy-discount-measure-'));
const source = fs.readFileSync(path.join(root, 'src/cart.cjs'), 'utf8');
if (!source.includes('subtotal >= 100')) throw new Error('Expected fixed discount fixture');

function runTest() {
  const start = process.hrtime.bigint();
  const result = spawnSync(process.execPath, ['--test', 'test/cart.test.cjs'], {
    cwd: temp,
    encoding: 'utf8',
  });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const outputText = `${result.stdout}\n${result.stderr}`;
  const counts = Object.fromEntries([...outputText.matchAll(/(?:^|\n)[#ℹ]\s*(tests|pass|fail)\s+(\d+)/g)].map(([, key, value]) => [key, Number(value)]));
  return { exitCode: result.status, elapsedMs: Math.round(elapsedMs * 100) / 100, counts };
}

try {
  fs.mkdirSync(path.join(temp, 'src'));
  fs.mkdirSync(path.join(temp, 'test'));
  fs.copyFileSync(path.join(root, 'test/cart.test.cjs'), path.join(temp, 'test/cart.test.cjs'));
  fs.writeFileSync(path.join(temp, 'src/cart.cjs'), source.replace('subtotal >= 100', 'subtotal > 100'));
  const startedAt = new Date().toISOString();
  const wallStart = process.hrtime.bigint();
  const before = runTest();
  if (before.exitCode === 0 || before.counts.fail !== 1 || before.counts.pass !== 1) {
    throw new Error('The deliberately broken fixture did not produce the expected one-test failure');
  }
  fs.writeFileSync(path.join(temp, 'src/cart.cjs'), source);
  const after = runTest();
  if (after.exitCode !== 0 || after.counts.pass !== 2 || after.counts.fail !== 0) {
    throw new Error('The corrected fixture did not pass both tests');
  }
  const totalElapsedMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
  const measurement = {
    measuredAtUtc: startedAt,
    method: 'Automated local rehearsal on a disposable copy; includes two Node test runs and one file edit. No Bob IDE or human repair time is included.',
    before: { change: 'subtotal > 100', ...before },
    after: { change: 'subtotal >= 100', ...after },
    failToPassElapsedMs: Math.round(totalElapsedMs * 100) / 100,
  };
  fs.writeFileSync(output, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(JSON.stringify(measurement, null, 2));
} finally {
  const resolvedTemp = fs.realpathSync(temp);
  const resolvedBase = fs.realpathSync(os.tmpdir());
  if (path.dirname(resolvedTemp) !== resolvedBase || !path.basename(resolvedTemp).startsWith('code-boy-discount-measure-')) {
    throw new Error(`Refusing to clean unexpected temporary directory: ${resolvedTemp}`);
  }
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
}
