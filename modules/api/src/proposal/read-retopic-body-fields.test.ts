import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { readRetopicBodyFields } from './read-retopic-body-fields';

async function setupTest() {
  const memory = await startTestMemory();

  const writeCall = async (attachments: readonly Uint8Array<ArrayBuffer>[]) => {
    const [called] = await writeRecords(memory.log, [
      {
        kind: 'tool_called',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: toolCalledCodec.encode({
          callID: 'call-1',
          runID: 'run-1',
          toolUseID: null,
          tool: 'memory.retopic',
        }),
        erasable: { input: { items: ['ab12'], to: { topic: 'diary', subject: 'self' } } },
        ...(attachments.length === 0 ? {} : { attachments }),
      },
    ]);

    invariant(called, 'the log wrote the call');

    return called.sequence;
  };

  return { memory, writeCall };
}

test('it says the move in the card sentence and lists each gist under it', async () => {
  const ctx = await setupTest();

  const plan = {
    sentence: 'self/lines → self/diary, 2 items',
    items: [
      { id: 'ab12', gist: 'tent poles', from: 'self/lines' },
      { id: 'cd34', gist: 'spare pump', from: 'self/lines' },
    ],
  };

  const sequence = await ctx.writeCall([new TextEncoder().encode(JSON.stringify(plan))]);

  const fields = await readRetopicBodyFields(ctx.memory.log, {
    tool: 'memory.retopic',
    thread: 'conversation',
    input: {},
    callSequence: sequence,
  });

  expect(fields).toStrictEqual({
    status: 'fields',
    sentence: 'self/lines → self/diary, 2 items',
    fields: { items: '[ab12] tent poles\n[cd34] spare pump' },
  });
});

test('it leaves the card without a body when a forget took what the call stored', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeCall([]);

  const fields = await readRetopicBodyFields(ctx.memory.log, {
    tool: 'memory.retopic',
    thread: 'conversation',
    input: {},
    callSequence: sequence,
  });

  expect(fields).toStrictEqual({ status: 'unreadable' });
});

test('it answers none for another tool', async () => {
  const ctx = await setupTest();

  const fields = await readRetopicBodyFields(ctx.memory.log, {
    tool: 'mail.send',
    thread: 'conversation',
    input: {},
    callSequence: 1,
  });

  expect(fields).toStrictEqual({ status: 'none' });
});
