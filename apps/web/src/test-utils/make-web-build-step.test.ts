import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitFor } from '@testing-library/react';
import { makeWebBuildStep } from './make-web-build-step';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-web-build-step-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runDir = join(directory, '4417');

  return {
    run: {
      runID: '4417',
      runsDir: directory,
      runDir,
      webDir: join(runDir, 'web'),
      webServerPath: join(runDir, 'web', 'server', 'server.js'),
      normalizeImagePath: join(runDir, 'normalize-image.js'),
      profilesDir: join(runDir, 'profiles'),
    },
  };
}

test('it returns the exit code of a web build that fails and bundles nothing', async () => {
  const ctx = await setupTest();

  const buildStep = makeWebBuildStep([process.execPath, '-e', 'process.exit(3)']);

  const exitCode = await buildStep(ctx.run, new AbortController().signal);
  const bundled = await Bun.file(ctx.run.normalizeImagePath).exists();

  expect(exitCode).toBe(3);
  expect(bundled).toBe(false);
});

test('it stops a running web build on abort, waits for it to exit, and bundles nothing', async () => {
  const ctx = await setupTest();

  const pidPath = join(ctx.run.runsDir, 'build.pid');

  const controller = new AbortController();

  const buildStep = makeWebBuildStep([
    process.execPath,
    '-e',
    `await Bun.write(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`,
  ]);

  const building = buildStep(ctx.run, controller.signal);

  await waitFor(async () => {
    const started = await Bun.file(pidPath).exists();

    expect(started).toBe(true);
  });

  const pidText = await Bun.file(pidPath).text();

  const pid = Number(pidText);

  controller.abort();

  const exitCode = await building;
  const bundled = await Bun.file(ctx.run.normalizeImagePath).exists();

  expect(exitCode).not.toBe(0);
  expect(() => process.kill(pid, 0)).toThrow();
  expect(bundled).toBe(false);
});

test('it bundles the image normalizer after the web build passes', async () => {
  const ctx = await setupTest();

  const buildStep = makeWebBuildStep([process.execPath, '-e', 'process.exit(0)']);

  const exitCode = await buildStep(ctx.run, new AbortController().signal);
  const bundled = await Bun.file(ctx.run.normalizeImagePath).exists();

  expect(exitCode).toBe(0);
  expect(bundled).toBe(true);
});
