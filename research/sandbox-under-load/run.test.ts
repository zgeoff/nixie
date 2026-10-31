import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'bun:test';

// The stub stands in for impz: it records each call, answers the reads the script makes, fails
// `impz rm` when STUB_RM_FAILS is set, prints STUB_AUDIT as the audit log, and prints one guest
// event for each turn.
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
      '  audit) printf "%s" "$STUB_AUDIT" ;;',
      '  proxy) exec sleep 30 ;;',
      '  exec) for arg in "$@"; do [ "$arg" = /app/turn.ts ] && { echo \'{"event":"result"}\'; exit 0; }; done; printf 200 ;;',
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
