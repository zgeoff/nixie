import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'bun:test';
// @boundaries-ignore a spike imports the repo's condition wait by path
import { waitForCondition } from '../../libs/testing/src/wait-for-condition';

// The stub stands in for impz: it records each call, answers the reads the script makes, fails
// `impz rm` when STUB_RM_FAILS is set, holds `impz new` for STUB_NEW_SECONDS, prints STUB_AUDIT as
// the audit log, and prints one guest event for each turn. With STUB_READY_HOLD set, it writes the
// proxy's and the ready check's arguments beside the calls and holds the ready check until the
// test's folder is gone, so the tool server stays up for the test to call.
function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'nixie-spike-run-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'impz'),
    [
      '#!/bin/bash',
      'echo "$1 $2 $3" >> "$STUB_CALLS"',
      'case "$1" in',
      '  rm) [ -n "$STUB_RM_FAILS" ] && { echo "the imp is busy" >&2; exit 1; }; exit 0 ;;',
      '  secret) [ "$2" = ls ] || cat > /dev/null; exit 0 ;;',
      '  new) sleep "${STUB_NEW_SECONDS:-0}"; exit 0 ;;',
      '  audit) printf "%s" "$STUB_AUDIT" ;;',
      '  proxy) echo "$@" > "$STUB_CALLS.proxy"; exec sleep 30 ;;',
      '  exec) for arg in "$@"; do [ "$arg" = /app/turn.ts ] && { echo \'{"event":"result"}\'; exit 0; }; done',
      '    if [ -n "$STUB_READY_HOLD" ] && [[ "${*: -1}" == */ready ]]; then printf "%s\\n" "$@" > "$STUB_CALLS.ready"; while [ -d "${STUB_CALLS%/*}" ]; do sleep 0.05; done; fi',
      '    printf 200 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'impz'), 0o755);

  return {
    calls: join(dir, 'calls.txt'),
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      STUB_CALLS: join(dir, 'calls.txt'),
      CLAUDE_CODE_OAUTH_TOKEN: 'invented-model-token',
      SPIKE_WORK: join(dir, 'work'),
      SPIKE_RESULTS: join(dir, 'results'),
    },
  };
}

test('it removes the secret when the imp removal fails, and exits with the failure', async () => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: { ...ctx.env, STUB_RM_FAILS: '1' },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);

  expect(code).toBe(1);
  expect(stderr).toInclude('cleanup left resources in impd:');
  expect(readFileSync(ctx.calls, 'utf8')).toInclude('secret rm nixie-spike-load-model');
});

test('it removes the imp that a SIGTERM during its creation interrupts', async () => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: { ...ctx.env, STUB_NEW_SECONDS: '1' },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  await waitForCondition(
    () => existsSync(ctx.calls) && readFileSync(ctx.calls, 'utf8').includes('new nixie-spike-load'),
  );
  child.kill('SIGTERM');
  const code = await child.exited;

  expect(code).toBe(143);
  expect(readFileSync(ctx.calls, 'utf8')).toInclude('rm nixie-spike-load \n');
  expect(readFileSync(ctx.calls, 'utf8')).not.toInclude('secret add');
});

test('it fails the run when the model token reaches a results file', async () => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: { ...ctx.env, STUB_AUDIT: 'request carried invented-model-token' },
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(code).toBe(1);
  expect(stdout).toInclude('token check: the token is in a results file');
});

test('it removes the imp and the secret after a run that succeeds', async () => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: ctx.env,
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(code).toBe(0);
  expect(stdout).toInclude('token check: clean');
  expect(readFileSync(ctx.calls, 'utf8')).toInclude('rm nixie-spike-load \n');
  expect(readFileSync(ctx.calls, 'utf8')).toInclude('secret rm nixie-spike-load-model');
});

test.each([
  ['a missing header', {}],
  ['an empty header', { authorization: '' }],
  ['the token with no scheme', { authorization: '{token}' }],
  ['the scheme with no token', { authorization: 'Bearer ' }],
  ['another scheme', { authorization: 'Basic {token}' }],
  ['a lowercase scheme', { authorization: 'bearer {token}' }],
  ['another token', { authorization: 'Bearer run-token-0000' }],
  ['a prefix of the token', { authorization: 'Bearer {prefix}' }],
  ['the token and one more character', { authorization: 'Bearer {token}0' }],
])('it refuses a tool server request with %s', async (_label, headers) => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: { ...ctx.env, STUB_READY_HOLD: '1' },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  onTestFinished(async () => {
    child.kill();
    await child.exited;
  });

  await waitForCondition(
    () => existsSync(`${ctx.calls}.proxy`) && existsSync(`${ctx.calls}.ready`),
    { timeoutMs: 4000 },
  );

  const port = /--reverse \d+:(\d+)/u.exec(readFileSync(`${ctx.calls}.proxy`, 'utf8'))?.[1];
  const token = /^authorization: Bearer (\S+)$/mu.exec(
    readFileSync(`${ctx.calls}.ready`, 'utf8'),
  )?.[1];

  expect(port).toBeString();
  expect(token).toBeString();

  const sent = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      value.replace('{token}', String(token)).replace('{prefix}', String(token).slice(0, -1)),
    ]),
  );
  const response = await fetch(`http://127.0.0.1:${String(port)}/ready`, { headers: sent });

  expect(response.status).toBe(401);
});

test('it answers a tool server request that carries the run token', async () => {
  const ctx = setupTest();

  const child = Bun.spawn(['bun', join(import.meta.dir, 'run.ts')], {
    env: { ...ctx.env, STUB_READY_HOLD: '1' },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  onTestFinished(async () => {
    child.kill();
    await child.exited;
  });

  await waitForCondition(
    () => existsSync(`${ctx.calls}.proxy`) && existsSync(`${ctx.calls}.ready`),
    { timeoutMs: 4000 },
  );

  const port = /--reverse \d+:(\d+)/u.exec(readFileSync(`${ctx.calls}.proxy`, 'utf8'))?.[1];
  const token = /^authorization: Bearer (\S+)$/mu.exec(
    readFileSync(`${ctx.calls}.ready`, 'utf8'),
  )?.[1];

  expect(port).toBeString();
  expect(token).toBeString();

  const response = await fetch(`http://127.0.0.1:${String(port)}/ready`, {
    headers: { authorization: `Bearer ${String(token)}` },
  });

  expect(response.status).toBe(200);
});
