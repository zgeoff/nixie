import { expect, test } from 'bun:test';
import { makeErasureRunner, readRecords, withWriteTransaction } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readTextPage } from '../store/read-text-page';
import { startTestPhone, startTestPhoneSource } from '../test-utils';
import { buildTextErasable } from './build-text-erasable';
import { phoneTextErasableDescriptor } from './phone-text-erasable-descriptor';
import { startTextErasure } from './start-text-erasure';

async function setupTest() {
  const phone = await startTestPhone();

  const taskSeed = buildTaskSeeder({ context: phone.tasks });

  await taskSeed.conversationStep();

  const fake = buildTestErasureEffects();

  const runner = makeErasureRunner({
    log: phone.tasks.log,
    definitions: phone.context.definitions,
    effects: fake.effects,
  });

  const forget = runner.register({ ...phoneTextErasableDescriptor, ...buildTextErasable() });

  return {
    ...phone,
    forget,
    readTextID: async () => {
      const page = await readTextPage(phone.context, { limit: 1 });

      return page.texts[0]?.text ?? '';
    },
    effectCalls: fake.calls,
    startSource: () => startTestPhoneSource(phone),
    startErasure: (text: string) =>
      withWriteTransaction(phone.writer, (tx) => startTextErasure(tx, { text })),
    readKeyIDs: async (
      kinds: readonly ('phone.text_received' | 'trigger.mail_arrived' | 'trigger.mail_woke')[],
    ) => {
      const rows = await sql`
        select key_id from records where kind in (${sql.join(kinds)}) order by sequence
      `.execute(phone.writer.db);

      return rows.rows.map((row) => z.object({ key_id: z.string().nullable() }).parse(row).key_id);
    },
    readSequences: async (kind: 'trigger.mail_woke') => {
      const records = await readRecords(phone.tasks.log, { afterSequence: 0, kinds: [kind] });

      return records.map((entry) => entry.record.sequence);
    },
    waitForCursor: (since: number) =>
      waitFor(async () => {
        const rows = await readTestTriggerRows(phone);

        expect(JSON.parse(rows.sources[0]?.cursor ?? '{"since":-1}')).toMatchObject({ since });
      }),
  };
}

test('it captures the keys of a text, its wake and its thread, and the wake that showed it', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('phone.wake_set', { window: '1m' });

  ctx.clock.advance(1000);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Your code is 5521' });

  ctx.clock.advance(20_000);

  await ctx.waitForCursor(text.receivedAt);

  const shortID = await ctx.readTextID();

  const keys = await ctx.readKeyIDs([
    'phone.text_received',
    'trigger.mail_arrived',
    'trigger.mail_woke',
  ]);

  const wakes = await ctx.readSequences('trigger.mail_woke');
  const start = await ctx.startErasure(shortID);

  expect(start.capture).toStrictEqual({
    keys: { ids: keys.filter((keyID) => keyID !== null) },
    cleanupKeys: [],
    sandboxCallIDs: [],
    purges: [],
    sessionCause: { textID: start.target.targetID, wakeSequences: wakes },
    turnInputs: { threads: ['conversation'], cleaned: false, floor: expect.any(Number) },
  });

  expect(start.target.kind).toBe('phone_text');
  expect(wakes).toHaveLength(1);
});

test('it captures no wake and no thread for a text that no rule woke', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Hello' });

  ctx.clock.advance(20_000);

  await ctx.waitForCursor(text.receivedAt);

  const shortID = await ctx.readTextID();
  const keys = await ctx.readKeyIDs(['phone.text_received']);
  const start = await ctx.startErasure(shortID);

  expect(start.capture).toMatchObject({
    keys: { ids: keys },
    sessionCause: { wakeSequences: [] },
    turnInputs: { threads: 'none', cleaned: false, floor: null },
  });
});

test('it forgets a text through the runner, so the tools and the wake keep no copy of it', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('phone.wake_set', { window: '1m' });

  ctx.clock.advance(1000);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Your code is 5521' });

  ctx.clock.advance(20_000);

  await ctx.waitForCursor(text.receivedAt);

  const shortID = await ctx.readTextID();
  const [wake] = await ctx.readSequences('trigger.mail_woke');
  const begun = await ctx.forget.begin({ text: shortID }, { by: 'user' });

  invariant(begun.status === 'begun');

  await ctx.forget.finish(begun.target.targetID);

  const read = await ctx.callTool('phone.read', { text: shortID });
  const after = await ctx.callTool('phone.list', {});

  const wakes = await readRecords(ctx.tasks.log, {
    afterSequence: 0,
    kinds: ['trigger.mail_woke'],
  });

  expect(begun.status).toBe('begun');
  expect(read).toMatchObject({ status: 'error', message: expect.stringContaining('UNKNOWN_TEXT') });
  expect(after).toMatchObject({ status: 'ok', result: { texts: [] } });
  expect(wakes[0]?.record.erasable.status).toBe('shredded');
  expect(ctx.effectCalls).toContain(`cleanupSessions {"recordSequence":${String(wake)}}`);
});

test('it refuses to forget a text that no stored text has the ID of', async () => {
  const ctx = await setupTest();
  const begun = await ctx.forget.begin({ text: 'txzzzzzzzz' }, { by: 'user' });

  expect(begun).toStrictEqual({ status: 'refused', reason: 'not_found' });
});
