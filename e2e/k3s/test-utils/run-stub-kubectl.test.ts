import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupTest() {
  return { stub: join(import.meta.dir, 'run-stub-kubectl.ts') };
}

test('it prints its arguments as one JSON line and exits 0', () => {
  const ctx = setupTest();

  const child = Bun.spawnSync([process.execPath, ctx.stub, 'get', 'pods']);

  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe('["get","pods"]\n');
});

test('it exits 1 with a message on stderr when its last argument is fail', () => {
  const ctx = setupTest();

  const child = Bun.spawnSync([process.execPath, ctx.stub, 'get', 'fail']);

  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toBe('error: the server refused\n');
});

test('it prints 3 lines after its arguments when its last argument is stream', () => {
  const ctx = setupTest();

  const child = Bun.spawnSync([process.execPath, ctx.stub, 'logs', 'stream']);

  expect(child.stdout.toString()).toBe('["logs","stream"]\nline 1\nline 2\nline 3\n');
});

test('it prints the reply its replies file maps its last argument to', async () => {
  const ctx = setupTest();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-stub-kubectl-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, 'replies.json'),
    JSON.stringify({ 'jsonpath={.status.podIP}': '10.42.0.7' }),
  );

  const child = Bun.spawnSync([
    process.execPath,
    ctx.stub,
    '--replies',
    join(dir, 'replies.json'),
    '--namespace',
    'nixie',
    'get',
    'pod',
    'jsonpath={.status.podIP}',
  ]);

  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe('10.42.0.7');
});

test('it exits 1 for a last argument its replies file has no reply for', async () => {
  const ctx = setupTest();
  const dir = await mkdtemp(join(tmpdir(), 'nixie-stub-kubectl-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'replies.json'), '{}');

  const child = Bun.spawnSync([
    process.execPath,
    ctx.stub,
    '--replies',
    join(dir, 'replies.json'),
    'jsonpath={.status.podIP}',
  ]);

  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toBe(
    'error: the stub has no reply for jsonpath={.status.podIP}\n',
  );
});

test('it keeps running after its arguments line when its last argument is hang', async () => {
  const ctx = setupTest();
  const child = Bun.spawn([process.execPath, ctx.stub, 'hang'], { stdout: 'pipe' });

  onTestFinished(() => child.kill('SIGKILL'));

  const reader = child.stdout.getReader();
  const first = await reader.read();

  expect(new TextDecoder().decode(first.value)).toBe('["hang"]\n');
  expect(child.exitCode).toBeNull();
});
