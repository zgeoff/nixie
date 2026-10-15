import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';
import { writeSeedMessages } from '../test-utils/write-seed-messages';

// The crash tests of the memory writer: nixie dies at each of the batch's six boundaries, once in
// the catch-up over messages from before memory started and once in a live batch. The restart
// runs the batch again from a fresh session, and it publishes once.
async function setupTest() {
  const nixie = await startTestNixie({ memoryWriter: true });

  return { nixie };
}

test.each([
  ['writer.batch.planned'],
  ['writer.batch.extracted'],
  ['writer.batch.gated'],
  ['writer.publish.inside'],
  ['writer.publish.before'],
  ['writer.publish.after'],
])(
  'it publishes the catch-up batch once when nixie dies at %s',
  async (point) => {
    const ctx = await setupTest();
    const [sequence] = await writeSeedMessages(ctx.nixie, ['I live at 4 Elm Row.']);

    const remember = {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: sequence },
      },
    };

    // one script for the first session and one for the rerun's fresh session
    ctx.nixie.writerModel.addReplies(remember, { text: 'Staged.' }, remember, { text: 'Staged.' });

    const first = ctx.nixie.harness.start([{ point }]);

    await first.ready;

    await first.waitForArrival(point);
    await first.kill();

    const second = ctx.nixie.harness.start();

    await second.ready;

    // the batch that ends the catch-up waits out the pace limit on the one clock
    await ctx.nixie.advanceUntilRecord(
      12_000,
      5,
      (record) =>
        record.kind === 'memory.batch_published' && record.payload['catchUpEnded'] === true,
    );

    await second.kill();

    const records = await ctx.nixie.readRecords();
    const items = await ctx.nixie.readRows('memory_items');
    const oracle = await runOracle(ctx.nixie);

    expect(
      records
        .filter((record) => record.kind === 'memory.batch_published')
        .map((record) => [record.payload['mode'], record.payload['applied']]),
    ).toStrictEqual([
      ['catch_up', [{ itemID: items[0]?.['item_id'], version: 1 }]],
      ['catch_up', []],
    ]);

    expect(items).toMatchObject([{ state: 'active', version: 1 }]);

    expect(oracle).toStrictEqual({
      repeatedStepKeys: [],
      repeatedActions: [],
      strayCalls: [],
      heldLeases: [],
      unreadyTasks: [],
      changedEndStates: [],
      projectionDrift: [],
    });
  },
  120_000,
);

test.each([
  ['writer.batch.planned'],
  ['writer.batch.extracted'],
  ['writer.batch.gated'],
  ['writer.publish.inside'],
  ['writer.publish.before'],
  ['writer.publish.after'],
])(
  'it publishes the live batch once when nixie dies at %s',
  async (point) => {
    const ctx = await setupTest();

    // the first start ends the empty catch-up, so the armed start holds only the live batch
    const first = ctx.nixie.harness.start();

    await first.ready;

    await ctx.nixie.waitForRecord(
      (record) => record.kind === 'task.step_committed' && record.stepKey === 'memory-writer:1',
    );

    await first.kill();

    const second = ctx.nixie.harness.start([{ point }]);

    await second.ready;

    ctx.nixie.model.addReplies({ text: 'Noted.' });

    const sequence = await second.request('sendMessage', {
      thread: 'conversation',
      text: 'I live at 4 Elm Row.',
    });

    const remember = {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: sequence },
      },
    };

    // one script for the first session and one for the rerun's fresh session
    ctx.nixie.writerModel.addReplies(remember, { text: 'Staged.' }, remember, { text: 'Staged.' });

    await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

    // a short batch waits for the conversation to go idle: one advance of 5 minutes on the one
    // clock, so the session's lease never runs out while the guest works on real time
    await ctx.nixie.advanceUntilArrival(second, point, { stepMs: 300_000, maxSteps: 1 });
    await second.kill();

    const third = ctx.nixie.harness.start();

    await third.ready;

    await ctx.nixie.waitForRecord(
      (record) => record.kind === 'memory.batch_published' && record.payload['mode'] === 'live',
    );

    await third.kill();

    const records = await ctx.nixie.readRecords();
    const items = await ctx.nixie.readRows('memory_items');
    const oracle = await runOracle(ctx.nixie);

    expect(
      records
        .filter(
          (record) => record.kind === 'memory.batch_published' && record.payload['mode'] === 'live',
        )
        .map((record) => record.payload['applied']),
    ).toStrictEqual([[{ itemID: items[0]?.['item_id'], version: 1 }]]);

    expect(items).toMatchObject([{ state: 'active', version: 1 }]);

    expect(oracle).toStrictEqual({
      repeatedStepKeys: [],
      repeatedActions: [],
      strayCalls: [],
      heldLeases: [],
      unreadyTasks: [],
      changedEndStates: [],
      projectionDrift: [],
    });
  },
  120_000,
);
