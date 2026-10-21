import { expect, onTestFinished, test } from 'bun:test';
import { createTestClient } from './test-utils/create-test-client';
import { readStepEvents } from './test-utils/read-step-events';
import { startTestNixie } from './test-utils/start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();
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

  const received = await readStepEvents(stream, () => Date.now());

  expect(received.filter((event) => event.kind.startsWith('tool_'))).toStrictEqual([
    { kind: 'tool_called', lagMs: expect.toBeWithin(0, 1000) },
    { kind: 'tool_result', lagMs: expect.toBeWithin(0, 1000) },
  ]);
}, 60_000);
