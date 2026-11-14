import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildIdentitySeeder } from '../test-utils/build-identity-seeder';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { writeCheckedNixieControl } from './write-checked-nixie-control';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    laptop,
    seed: buildIdentitySeeder({ context: api.context }),
    readNixieRecords: () =>
      readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['nixie.paused', 'nixie.resumed'],
      }),
  };
}

test('it refuses a pause from an identity revoked after it signed in, and writes nothing', async () => {
  const ctx = await setupTest();
  const revoked = await ctx.seed.revokedIdentity();

  const controlled = await writeCheckedNixieControl(ctx.context, revoked.caller, {
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
    control: 'pause',
  });

  const records = await ctx.readNixieRecords();

  expect(controlled).toStrictEqual({ status: 'unauthorized' });
  expect(records).toStrictEqual([]);
});

test('it answers a pause again under the same action ID with the stored result', async () => {
  const ctx = await setupTest();

  const input = {
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
    control: 'pause',
  } as const;

  const first = await writeCheckedNixieControl(ctx.context, ctx.laptop.caller, input);
  const retried = await writeCheckedNixieControl(ctx.context, ctx.laptop.caller, input);
  const records = await ctx.readNixieRecords();

  expect(first).toStrictEqual({
    status: 'controlled',
    paused: { cause: 'owner', since: expect.toBeNumber() },
  });

  expect(retried).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('it refuses an action ID that a pause used when a resume reuses it', async () => {
  const ctx = await setupTest();

  const clientActionID = '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f';

  await writeCheckedNixieControl(ctx.context, ctx.laptop.caller, {
    clientActionID,
    control: 'pause',
  });

  const reused = await writeCheckedNixieControl(ctx.context, ctx.laptop.caller, {
    clientActionID,
    control: 'resume',
  });

  expect(reused).toStrictEqual({ status: 'reused' });
});
