import { expect, test } from 'bun:test';
import { createStubWriterSession } from './create-stub-writer-session';

test('it stages the write into the open batch, bound to the version shown, and ends with fixed token counts', async () => {
  const stub = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'Lives on Oak Lane',
    quote: 'Oak Lane',
    sourceSequence: 7,
    itemID: 'item-1',
  });

  const batch = stub.staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I moved to Oak Lane',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-1', { version: 2, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const usage = await stub.model.runSession({
    systemPrompt: '',
    prompt: '',
    signal: new AbortController().signal,
    stepRunID: 'memory-writer:1@1',
  });

  expect(batch.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'Lives on Oak Lane',
      quote: 'Oak Lane',
      sourceSequence: 7,
      target: { itemID: 'item-1', version: 2 },
    },
  ]);

  expect(usage).toStrictEqual({
    inputTokens: 100,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});

test('it flags a possible self-note into the open batch, and stages no write', async () => {
  const stub = createStubWriterSession({
    op: 'flag',
    text: 'The assistant favours the jazz station.',
    sourceSequence: 7,
  });

  const batch = stub.staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'You always pick jazz',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await stub.model.runSession({
    systemPrompt: '',
    prompt: '',
    signal: new AbortController().signal,
    stepRunID: 'memory-writer:1@1',
  });

  expect(batch.readFlags()).toStrictEqual([
    { text: 'The assistant favours the jazz station.', sourceSequence: 7 },
  ]);

  expect(batch.close()).toStrictEqual([]);
});

test('it stages the write again in each later session, bound to the version that batch shows', async () => {
  const stub = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'Lives on Oak Lane',
    quote: 'Oak Lane',
    sourceSequence: 7,
    itemID: 'item-1',
  });

  const sources = new Map([
    [
      7,
      {
        sequence: 7,
        text: 'I moved to Oak Lane',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      },
    ],
  ]);

  const signal = new AbortController().signal;

  const first = stub.staging.open({
    sources,
    shown: new Map([['item-1', { version: 2, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  first.close();

  const second = stub.staging.open({
    sources,
    shown: new Map([['item-1', { version: 3, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  expect(second.close()).toMatchObject([{ target: { itemID: 'item-1', version: 3 } }]);
  expect(stub.model.runSession).toHaveBeenCalledTimes(2);
});
