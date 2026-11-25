import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNodePullRequestHost,
  createNodeRepoHost,
  createRepoState,
  makeProcessSupervisorPort,
  runSupervisorProcess,
} from '@wringer/core';
import { runCLI } from '@wringer/gunshi';
import { updateEnv } from '@zgeoff/testing';
import { $ } from 'bun';
import { z } from 'zod';
import { createVerifyRegistry } from '../create-verify-registry';

// The prod target reads a cluster through kubectl, so the test puts a kubectl on PATH that answers
// for a ready nixie, and serves the web origin from a loopback server. wringer keys each run to the
// repo's head commit against `main`, so the test repo gets a commit on `main`.
async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-verify-prod-'));

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: { '/health/ready': Response.json({ status: 'ready' }) },
  });

  onTestFinished(() => server.stop(true));

  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  const containers = JSON.stringify([{ name: 'nixie', image }]);

  const kubectl = [
    '#!/bin/sh',
    'case "$*" in',
    `  *"get pod nixie-0"*) echo '{"spec":{"containers":${containers}},"status":{"conditions":[{"type":"Ready","status":"True"}]}}';;`,
    `  *"get statefulset nixie"*) echo '{"spec":{"template":{"spec":{"containers":${containers}}}}}';;`,
    `  *"get --raw"*) echo '{"status":"ready","parts":{},"dependencies":{}}';;`,
    `  *"logs nixie-0"*) echo '{"time":"2026-11-15T01:00:00.000Z","event":"server.started"}';;`,
    '  *) exit 1;;',
    'esac',
    '',
  ].join('\n');

  const bin = join(root, 'bin');

  await mkdir(bin);
  await writeFile(join(bin, 'kubectl'), kubectl);
  await chmod(join(bin, 'kubectl'), 0o755);

  await $`git init --quiet --initial-branch=main`.cwd(root);

  await $`git -c user.name=test -c user.email=test@example.test commit --quiet --allow-empty --message start`.cwd(
    root,
  );

  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
  updateEnv('NIXIE_PROD_URL', server.url.origin);
  updateEnv('NIXIE_PROD_KUBECONFIG', join(root, 'kubeconfig.yaml'));
  updateEnv('NIXIE_PROD_TOKEN', 'a-read-only-token-for-the-test');

  const registry = createVerifyRegistry();

  // The supervisor runs as its own process, so it starts the repo's verify script, as the CLI does.
  const selfCommand = [process.execPath, join(import.meta.dir, '..', 'verify.ts')];

  const envelopeSchema = z.looseObject({
    ok: z.boolean(),
    error: z.looseObject({ code: z.string(), hint: z.string().nullable() }).nullable(),
  });

  // Each command runs in the test process: a cold start of the CLI per command outlasted the time
  // limit on a busy runner.
  const runVerify = async (args: readonly string[]) => {
    // `exec` passes on each word after `--`, so the target flag goes before it.
    const end = args.includes('--') ? args.indexOf('--') : args.length;
    const argv = [...args.slice(0, end), '--target', 'prod', ...args.slice(end)];
    const written: string[] = [];

    const exitCode = await runCLI(registry, {
      argv,
      cwd: root,
      isTTY: false,
      isAgent: true,
      env: process.env,
      writeStdout: (text) => {
        written.push(text);
      },
      readRepoRoot: () => Promise.resolve(root),
      openRepo: (repoRoot) => ({
        state: createRepoState(repoRoot, registry.stateDir),
        repoHost: createNodeRepoHost(),
        pullRequests: createNodePullRequestHost(repoRoot),
        supervisor: makeProcessSupervisorPort({
          selfCommand,
          root: repoRoot,
          stateDir: registry.stateDir,
        }),
      }),
      runSupervisor: runSupervisorProcess,
    });

    const lastLine = written.join('').trim().split('\n').at(-1) ?? '';

    return { exitCode, envelope: envelopeSchema.parse(JSON.parse(lastLine)) };
  };

  // An attached run keeps a supervisor that writes into the repo until `detach`, and bun runs these
  // callbacks in the order they were added, so the one callback ends the run before the folder goes.
  onTestFinished(async () => {
    await runVerify(['detach']);
    await rm(root, { recursive: true, force: true });
  });

  return { runVerify };
}

test.each([
  ['a write action', ['action', 'enrol-code']],
  ['a raw exec', ['exec', '--', 'ls']],
  ['an API write', ['http', 'request', '--method', 'POST', '--path', '/rpc/conversation/send']],
])('it refuses %s on prod with exit 3 and the needs-owner hint', async (_name, args) => {
  const ctx = await setupTest();

  await ctx.runVerify(['attach']);
  await ctx.runVerify(['doctor']);

  const ran = await ctx.runVerify(args);

  expect({
    exitCode: ran.exitCode,
    code: ran.envelope.error?.code,
    hint: ran.envelope.error?.hint,
  }).toStrictEqual({
    exitCode: 3,
    code: 'read-only',
    hint: expect.stringContaining('report it to the owner'),
  });
});

test('it refuses a database write on prod, which gives the db driver no config', async () => {
  const ctx = await setupTest();

  await ctx.runVerify(['attach']);
  await ctx.runVerify(['doctor']);

  const ran = await ctx.runVerify(['db', 'query', 'delete from records', '--write']);

  expect({ exitCode: ran.exitCode, code: ran.envelope.error?.code }).toStrictEqual({
    exitCode: 2,
    code: 'usage',
  });
});

test('it attaches to a ready prod', async () => {
  const ctx = await setupTest();
  const ran = await ctx.runVerify(['attach']);

  expect({ exitCode: ran.exitCode, error: ran.envelope.error }).toStrictEqual({
    exitCode: 0,
    error: null,
  });
});

test('it passes the doctor on a ready prod', async () => {
  const ctx = await setupTest();

  await ctx.runVerify(['attach']);

  const ran = await ctx.runVerify(['doctor']);

  expect({ exitCode: ran.exitCode, error: ran.envelope.error }).toStrictEqual({
    exitCode: 0,
    error: null,
  });
});
