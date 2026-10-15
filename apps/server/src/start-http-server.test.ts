import { expect, onTestFinished, test } from 'bun:test';
import { collectStepEvents } from './test-utils/collect-step-events';
import { createTestClient } from './test-utils/create-test-client';
import { startTestNixie } from './test-utils/start-test-nixie';

// nixie in a test build at ready, with a device signed in through the code it printed at start, and
// a signal that ends each stream the test follows
async function setupTest() {
  const nixie = await startTestNixie();

  // boot data: every procedure but enrol needs a device session
  const clients = await createTestClient(nixie);

  const stopping = new AbortController();

  onTestFinished(() => {
    stopping.abort();
  });

  return { ...nixie, ...clients, signal: stopping.signal };
}

test('it streams a tool call and its result within a second of nixie recording them', async () => {
  const ctx = await setupTest();
  const page = await ctx.client.conversation.read({ thread: 'conversation', limit: 1 });

  const stream = await ctx.client.records.follow(
    { afterSequence: page.readAtSequence, thread: 'conversation' },
    { signal: ctx.signal },
  );

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is ten to six in Oslo.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What time is it in Oslo?',
    thread: 'conversation',
    timeZone: 'Europe/Oslo',
  });

  const received = await collectStepEvents(stream, () => Date.now());

  // nixie and the test share one clock, so each lag is the stream's own delay
  expect(received.filter((event) => event.kind.startsWith('tool_'))).toStrictEqual([
    { kind: 'tool_called', lagMs: expect.toBeWithin(0, 1000) },
    { kind: 'tool_result', lagMs: expect.toBeWithin(0, 1000) },
  ]);
}, 60_000);
