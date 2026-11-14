import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createRouterClient } from '@orpc/server';
import { startTestAPI } from '../test-utils/start-test-api';
import { createHostNixieProcedures } from './create-host-nixie-procedures';

async function setupTest() {
  const api = await startTestAPI();

  return {
    ...api,
    nixie: createRouterClient(createHostNixieProcedures(api.context)),
    readNixieRecords: () =>
      readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['nixie.paused', 'nixie.resumed'],
      }),
  };
}

test('#pause pauses nixie for the owner, and writes the host as the actor', async () => {
  const ctx = await setupTest();
  const paused = await ctx.nixie.pause();
  const records = await ctx.readNixieRecords();

  expect(paused).toStrictEqual({ paused: { cause: 'owner', since: expect.toBeValidDate() } });

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    ['nixie.paused', { cause: 'owner', recoveryID: null, by: 'host' }],
  ]);
});

test('#resume resumes nixie, and writes the host as the actor', async () => {
  const ctx = await setupTest();

  await ctx.nixie.pause();

  const resumed = await ctx.nixie.resume();
  const records = await ctx.readNixieRecords();

  expect(resumed).toStrictEqual({ paused: null });

  expect(records.map((read) => [read.record.kind, read.record.payload]).at(-1)).toStrictEqual([
    'nixie.resumed',
    { by: 'host' },
  ]);
});

test('#resume gives null and writes nothing while nixie runs', async () => {
  const ctx = await setupTest();
  const resumed = await ctx.nixie.resume();
  const records = await ctx.readNixieRecords();

  expect(resumed).toStrictEqual({ paused: null });
  expect(records).toStrictEqual([]);
});
