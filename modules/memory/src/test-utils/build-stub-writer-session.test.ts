import { expect, test } from 'bun:test';
import { buildStubWriterSession } from './build-stub-writer-session';

test('it stages the write into the open batch, bound to the version shown, and ends with fixed token counts', async () => {
  const stub = buildStubWriterSession({
    op: 'remember',
    text: 'Lives on Oak Lane',
    quote: 'Oak Lane',
    sourceSequence: 7,
    itemID: 'item-1',
  });
  const batch = stub.staging.open({
    sources: new Map([[7, { sequence: 7, text: 'I moved to Oak Lane', spans: [] }]]),
    shown: new Map([['item-1', 2]]),
  });

  const usage = await stub.model.runSession({
    systemPrompt: '',
    prompt: '',
    signal: new AbortController().signal,
  });

  expect(batch.close()).toStrictEqual([
    {
      op: 'remember',
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

test('it stages the write again in each later session, bound to the version that batch shows', async () => {
  const stub = buildStubWriterSession({
    op: 'remember',
    text: 'Lives on Oak Lane',
    quote: 'Oak Lane',
    sourceSequence: 7,
    itemID: 'item-1',
  });
  const sources = new Map([[7, { sequence: 7, text: 'I moved to Oak Lane', spans: [] }]]);
  const signal = new AbortController().signal;
  const first = stub.staging.open({ sources, shown: new Map([['item-1', 2]]) });

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });
  first.close();

  const second = stub.staging.open({ sources, shown: new Map([['item-1', 3]]) });

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  expect(second.close()).toMatchObject([{ target: { itemID: 'item-1', version: 3 } }]);
  expect(stub.model.runSession).toHaveBeenCalledTimes(2);
});
