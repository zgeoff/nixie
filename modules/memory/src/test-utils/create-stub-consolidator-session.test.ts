import { expect, test } from 'bun:test';
import { createStubConsolidatorSession } from './create-stub-consolidator-session';

test('it stages the diff into the open run, bound to the versions shown, and ends with fixed token counts', async () => {
  const stub = createStubConsolidatorSession([
    { kind: 'retire', itemIDs: ['item-1'], reason: 'The trip ended in May.' },
  ]);

  const run = stub.staging.open(
    new Map([
      [
        'item-1',
        {
          shortID: 'k3x9m2p7qa',
          version: 3,
          text: 'Is in Lisbon until May',
          source: 'owner',
          isPinned: false,
          subject: 'owner',
        },
      ],
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
  const stub = createStubConsolidatorSession([
    { kind: 'retire', itemIDs: ['item-1'], reason: 'The trip ended in May.' },
  ]);

  const signal = new AbortController().signal;

  const item = {
    shortID: 'k3x9m2p7qa',
    text: 'Is in Lisbon until May',
    source: 'owner',
    isPinned: false,
    subject: 'owner',
  } as const;

  const first = stub.staging.open(new Map([['item-1', { ...item, version: 3 }]]), 30);

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  first.close();

  const second = stub.staging.open(new Map([['item-1', { ...item, version: 4 }]]), 30);

  await stub.model.runSession({ systemPrompt: '', prompt: '', signal });

  expect(second.close()).toMatchObject([{ inputs: [{ itemID: 'item-1', version: 4 }] }]);
  expect(stub.model.runSession).toHaveBeenCalledTimes(2);
});

test('it stages the summary it is given beside an empty diff', async () => {
  const stub = createStubConsolidatorSession([], 'Two items about tea conflict.');

  const item = {
    shortID: 'k3x9m2p7qa',
    version: 1,
    text: 'Drinks green tea',
    source: 'owner',
    isPinned: false,
    subject: 'owner',
  } as const;

  const run = stub.staging.open(new Map([['item-1', item]]), 30);

  await stub.model.runSession({
    systemPrompt: '',
    prompt: '',
    signal: new AbortController().signal,
  });

  expect(run.readSummary()).toBe('Two items about tea conflict.');
  expect(run.close()).toStrictEqual([]);
});
