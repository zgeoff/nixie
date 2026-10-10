import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxRecorder } from '@heynixie/sandbox';
import { buildSandboxAdapter } from './build-sandbox-adapter';

const entry = join(import.meta.dir, 'index.ts');

// a string only the process double holds, and one only the imp adapter holds
const processMarker = 'the tool relay has no TCP address';
const impMarker = 'public egress without the host addresses in IMP_HOST_ADDRESSES';

async function buildBundle(isTestBuild: boolean): Promise<string> {
  const outdir = await mkdtemp(join(tmpdir(), 'nixie-server-bundle-'));

  onTestFinished(() => rm(outdir, { recursive: true, force: true }));

  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: 'bun',
    define: { NIXIE_TEST_BUILD: String(isTestBuild) },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'the bundle failed');
  }
  const texts = await Promise.all(result.outputs.map((output) => output.text()));

  return texts.join('\n');
}

test('a test build wires the process double', () => {
  const recorder: SandboxRecorder = {
    write: () => Promise.resolve(),
    findRow: () => Promise.resolve(null),
    list: () => Promise.resolve([]),
  };
  const adapter = buildSandboxAdapter({
    recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    env: {},
    testRootDir: tmpdir(),
  });

  expect(adapter).toMatchObject({ id: 'process', boundary: 'process' });
});

test('the release bundle holds the imp adapter and no part of the process double', async () => {
  const release = await buildBundle(false);
  const testBuild = await buildBundle(true);

  expect(release).toContain(impMarker);
  expect(release).not.toContain(processMarker);
  expect(testBuild).toContain(processMarker);
});
