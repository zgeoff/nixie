import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { TriggerContext, TriggersTables } from '@heynixie/triggers';
import { deliverTriggerBatch } from '@heynixie/triggers';
import { waitFor } from '@zgeoff/testing';
import { startTestCoding } from '../test-utils/start-test-coding';
import type { SessionEvent } from '../types';
import { buildCodingSource } from './build-coding-source';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  const source = buildCodingSource(ctx.coding, ctx.adapter);
  const health: string[] = [];

  return {
    ...ctx,
    health,
    seed: {
      // a join binds in the start's own transaction, with no spawn or step to run
      session: async (): Promise<string> => {
        ctx.adapter.addSession({ id: 'cloud.3f9a1c2e.00000001', name: 'login fix', state: 'idle' });

        const listed = await ctx.callTool(claim, 'coding.sessions', {});

        const shortID = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

        return ctx.startTask(claim, {
          name: 'Fix the flaky login test',
          brief: 'Watch the login fix.',
          session: shortID ?? '',
          wake: ['idle'],
        });
      },
    },
    startSource: async (cursor: string | null) => {
      const controller = new AbortController();

      const trigger: TriggerContext = {
        cursor,
        deliver: (batch) => deliverTriggerBatch(ctx.core, source.id, batch),
        reportHealth: (state) => {
          health.push(state);
        },
        signal: controller.signal,
      };

      await source.start(trigger);

      // the harness's own cleanup stops the writer, so the source stops on its stack, before it
      ctx.defer(async () => {
        controller.abort();

        await source.stop();
      });
    },
    readEvents: async (taskID: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['trigger.task_input'],
      });

      return entries.map((entry) => ({
        dedupeKey: entry.record.payload['dedupeKey'],
        wake: entry.record.payload['wake'],
      }));
    },
    readCursor: async () => {
      const row = await ctx.log.writer.db
        .$extendTables<TriggersTables>()
        .selectFrom('trigger_sources')
        .select('cursor')
        .where('source_id', '=', source.id)
        .executeTakeFirst();

      return row?.cursor ?? null;
    },
    buildState: (eventKey: string, state: 'idle' | 'running'): SessionEvent => ({
      session: 'cloud.3f9a1c2e.00000001',
      eventKey,
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state,
      question: null,
    }),
    readAllEventRecords: () =>
      readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.task_input'] }),
  };
}

test('it catches up an event that reached the trail before the source started, and lands each event once', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  ctx.adapter.emit([ctx.buildState('cloud|1', 'idle')]);

  await ctx.startSource('0');

  ctx.adapter.emit([ctx.buildState('cloud|2', 'running')]);

  const events = await waitFor(async () => {
    const landed = await ctx.readEvents(taskID);

    expect(landed.length).toBe(2);

    return landed;
  });

  expect(events).toStrictEqual([
    { dedupeKey: 'cloud|1', wake: true },
    { dedupeKey: 'cloud|2', wake: false },
  ]);
});

test('it keeps only the cursor of its first read at its first start, and never replays the trail', async () => {
  const ctx = await setupTest();

  ctx.adapter.emit([
    { ...ctx.buildState('cloud|1', 'idle'), session: 'cloud.3f9a1c2e.99999999' },
    { ...ctx.buildState('cloud|2', 'idle'), session: 'cloud.3f9a1c2e.99999999' },
  ]);

  await ctx.startSource(null);

  const cursor = await waitFor(async () => {
    const stored = await ctx.readCursor();

    expect(stored).not.toBeNull();

    return stored;
  });

  expect(cursor).toBe(JSON.stringify('2'));
});

test('it drops the events of a session that no coding task binds, and stores nothing of them', async () => {
  const ctx = await setupTest();

  await ctx.startSource('0');

  ctx.adapter.emit([{ ...ctx.buildState('cloud|1', 'idle'), session: 'cloud.3f9a1c2e.99999999' }]);

  await waitFor(async () => {
    const cursor = await ctx.readCursor();

    expect(cursor).toBe(JSON.stringify('1'));
  });

  const records = await ctx.readAllEventRecords();

  expect(records).toStrictEqual([]);
});

test('it reports itself running once it delivers a page', async () => {
  const ctx = await setupTest();

  await ctx.startSource('0');

  ctx.adapter.emit([{ ...ctx.buildState('cloud|1', 'idle'), session: 'cloud.3f9a1c2e.99999999' }]);

  await waitFor(() => {
    expect(ctx.health).toContain('running');
  });

  expect(ctx.health.at(-1)).toBe('running');
});

test('it gives the adapter the sessions that open coding tasks bind, so it reads their state after a restart', async () => {
  const ctx = await setupTest();

  await ctx.seed.session();
  await ctx.startSource('0');

  await waitFor(() => {
    expect(ctx.adapter.boundReads).toContainEqual(['cloud.3f9a1c2e.00000001']);
  });
});
