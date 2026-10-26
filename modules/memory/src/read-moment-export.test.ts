import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentExport } from './read-moment-export';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads every moment once, oldest first, across more than one page', async () => {
  const ctx = await setupTest();

  const [wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      payload: {},
    },
  ]);

  invariant(wake);

  const titles = Array.from({ length: 23 }, (_, index) => `Bed ${String(index + 1)}`);

  for (const title of titles) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'task-garden',
      firstSequence: wake.sequence,
      lastSequence: wake.sequence,
      title,
    });
  }

  const moments = await Array.fromAsync(readMomentExport(ctx.memory.log));

  expect(moments.map((moment) => ('title' in moment ? moment.title : null))).toStrictEqual(titles);
});

test('it exports a moment whose destroy started and is not done as its ID alone, with no destroy time', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plum tree needs netting before the birds find it' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Netting the plum tree',
  });

  invariant(kept.status === 'written');

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'started' },
    },
  ]);

  const moments = await Array.fromAsync(readMomentExport(ctx.memory.log));

  expect(moments).toStrictEqual([{ momentID: kept.momentID, destroyedAt: null }]);
});

test("it reads a moment's span with each record's text and source", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'plant the garlic in October' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Garlic',
  });

  const [moment] = await Array.fromAsync(readMomentExport(ctx.memory.log));

  invariant(moment && 'records' in moment);

  expect(moment.records).toStrictEqual([
    {
      sequence: message.sequence,
      kind: 'owner_message',
      recordedAt: expect.toBeString(),
      source: 'nixie',
      payload: null,
      decision: null,
      text: expect.toInclude('plant the garlic in October'),
      isGap: false,
    },
  ]);
});

test("it exports a tool call and its result with each record's payload and policy decision", async () => {
  const ctx = await setupTest();

  const [called, result] = await writeRecords(ctx.memory.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      decision: { outcome: 'allow', stage: 1, rule: null },
      payload: { callID: 'call-4', runID: 'run-2', toolUseID: 'toolu_4', tool: 'web.fetch' },
      erasable: { input: { url: 'https://example.test/garlic' } },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: {
        callID: 'call-4',
        runID: 'run-2',
        toolUseID: 'toolu_4',
        outcome: 'result',
        actionID: null,
        sources: ['untrusted'],
      },
      erasable: { result: { title: 'Growing garlic' } },
    },
  ]);

  invariant(called && result);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: called.sequence,
    lastSequence: result.sequence,
    title: 'Reading up on garlic',
  });

  const [moment] = await Array.fromAsync(readMomentExport(ctx.memory.log));

  invariant(moment && 'records' in moment);

  expect(moment.records).toStrictEqual([
    {
      sequence: called.sequence,
      kind: 'tool_called',
      recordedAt: expect.toBeString(),
      source: 'nixie',
      payload: { callID: 'call-4', runID: 'run-2', toolUseID: 'toolu_4', tool: 'web.fetch' },
      decision: 'allow',
      text: JSON.stringify({ input: { url: 'https://example.test/garlic' } }),
      isGap: false,
    },
    {
      sequence: result.sequence,
      kind: 'tool_result',
      recordedAt: expect.toBeString(),
      source: 'untrusted',
      payload: {
        callID: 'call-4',
        runID: 'run-2',
        toolUseID: 'toolu_4',
        outcome: 'result',
        actionID: null,
        sources: ['untrusted'],
      },
      decision: null,
      text: JSON.stringify({ result: { title: 'Growing garlic' } }),
      isGap: false,
    },
  ]);
});
