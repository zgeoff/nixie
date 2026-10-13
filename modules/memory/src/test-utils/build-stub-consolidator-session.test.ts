import { expect, test } from 'bun:test';
import { buildStubConsolidatorSession } from './build-stub-consolidator-session';

test('it stages the diff into the open run, bound to the versions shown, and ends with fixed token counts', async () => {
  const stub = buildStubConsolidatorSession([
    { kind: 'retire', itemIDs: ['item-1'], reason: 'The trip ended in May.' },
  ]);
  const run = stub.staging.open(
    new Map([
      ['item-1', { version: 3, text: 'Is in Lisbon until May', source: 'owner', isPinned: false }],
    ]),
    30,
  );

  const usage = await stub.model.runSession({
    systemPrompt: '',
    prompt: '',
    signal: new AbortController().signal,
  });

  expect(run.close()).toStrictEqual([
    {
      kind: 'retire',
      inputs: [{ itemID: 'item-1', version: 3 }],
      reason: 'The trip ended in May.',
      source: 'owner',
    },
  ]);
  expect(usage).toStrictEqual({
    inputTokens: 400,
    outputTokens: 60,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});

test('it stages the diff again in each later run, bound to the versions that run shows', async () => {
  const stub = buildStubConsolidatorSession([
    { kind: 'retire', itemIDs: ['item-1'], reason: 'The trip ended in May.' },
  ]);
  const signal = new AbortController().signal;
  const item = { text: 'Is in Lisbon until May', source: 'owner', isPinned: false } as const;
  const first = stub.staging.open(new Map([['item-1', { ...item, version: 3 }]]), 30);

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });
  first.close();

  const second = stub.staging.open(new Map([['item-1', { ...item, version: 4 }]]), 30);

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  expect(second.close()).toMatchObject([{ inputs: [{ itemID: 'item-1', version: 4 }] }]);
  expect(stub.model.runSession).toHaveBeenCalledTimes(2);
});
