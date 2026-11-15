import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeviceSession, seedPasskey } from '@heynixie/api/test-utils';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildRecordingHostTransport } from '../test-utils/build-recording-host-transport';
import { startTestControlSocket } from '../test-utils/start-test-control-socket';
import { createPasskeyCommands } from './create-passkey-commands';
import { readCLIArgs } from './read-cli-args';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-passkeys-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'control.sock');

  const api = await startTestControlSocket({ path: socketPath });

  const host = buildRecordingHostTransport(socketPath);

  const commands = new Map(createPasskeyCommands(host.transport));

  return {
    api,
    host,
    socketPath,
    run: async (argv: readonly string[]) => {
      const parsed = await readCLIArgs(
        [...argv, '--config', '/etc/nixie/config.yaml'],
        [...commands.keys()],
      );

      invariant(parsed.kind === 'command');

      const run = commands.get(parsed.command);

      invariant(run);

      const io = { log: mock(), print: mock(), waitForSignal: mock() };

      return { exitCode: await run(parsed.flags, io, parsed.args), io };
    },
  };
}

test('it prints the passkey code over the host transport, and records its issue without the code', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['passkey-code']);

  const issued = await readRecords(ctx.api.context.log, {
    afterSequence: 0,
    kinds: ['passkey_code.issued'],
  });

  expect(result.exitCode).toBe(0);

  expect(ctx.host.record.requests).toStrictEqual([
    { socketPath: ctx.socketPath, name: 'passkey code' },
  ]);

  expect(result.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(
      /^[0-9A-Z]{5}-[0-9A-Z]{5}\nThe code works once, until \d{4}-\d{2}-\d{2}T[\d:.]+Z\.$/u,
    ),
  );

  expect(issued.map((read) => Object.keys(read.record.payload))).toStrictEqual([['expiresAt']]);
});

test('it lists every passkey, live and revoked, as JSON', async () => {
  const ctx = await setupTest();
  const session = await createDeviceSession(ctx.api.context, 'laptop');
  const seeded = await seedPasskey(ctx.api.context, { caller: session.caller, label: 'Phone' });
  const result = await ctx.run(['passkeys']);

  expect(result.exitCode).toBe(0);

  expect(result.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.toSatisfy((printed: string) =>
      printed.includes(`"passkeyID":"${seeded.passkeyID}","label":"Phone","synced":false`),
    ),
  );
});

test('it revokes a passkey by its ID with no passkey check', async () => {
  const ctx = await setupTest();
  const session = await createDeviceSession(ctx.api.context, 'laptop');
  const seeded = await seedPasskey(ctx.api.context, { caller: session.caller });
  const result = await ctx.run(['passkeys', 'revoke', seeded.passkeyID]);

  const revoked = await readRecords(ctx.api.context.log, {
    afterSequence: 0,
    kinds: ['passkey.revoked'],
  });

  expect(result.exitCode).toBe(0);

  expect(result.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(seeded.passkeyID),
  );

  expect(revoked.map((read) => read.record.payload)).toStrictEqual([
    { passkeyID: seeded.passkeyID, revokedBy: 'host' },
  ]);
});

test('it refuses to revoke a passkey that no one holds', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.run(['passkeys', 'revoke', 'missing']).catch((error: unknown) => error);

  expect(outcome).toBeInstanceOf(Error);
});

test('it refuses a passkeys action that is not revoke, and reaches no server', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['passkeys', 'delete', 'passkey-1']);

  expect(result.exitCode).toBe(2);

  expect(result.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie passkeys takes no argument, or revoke and a passkey ID',
  );

  expect(ctx.host.record.requests).toStrictEqual([]);
});
