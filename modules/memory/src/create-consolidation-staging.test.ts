import { expect, test } from 'bun:test';
import { createConsolidationStaging } from './create-consolidation-staging';

test('it binds a merge to the versions the session read and takes the least trusted source', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-1',
        {
          shortID: 'k3x9m2p7qa',
          version: 2,
          text: 'Is allergic to peanuts',
          source: 'owner',
          isPinned: false,
        },
      ],
      [
        'item-2',
        {
          shortID: 'w8n4c6t1rb',
          version: 5,
          text: 'Has a peanut allergy',
          source: 'untrusted',
          isPinned: false,
        },
      ],
    ]),
    30,
  );

  staging.stage([
    {
      kind: 'merge',
      itemIDs: ['item-1', 'item-2'],
      text: ' Is allergic to peanuts ',
      reason: 'Both items state the same allergy.',
    },
  ]);

  expect(run.close()).toStrictEqual([
    {
      kind: 'merge',
      inputs: [
        { itemID: 'item-1', version: 2 },
        { itemID: 'item-2', version: 5 },
      ],
      text: 'Is allergic to peanuts',
      reason: 'Both items state the same allergy.',
      source: 'untrusted',
    },
  ]);
});

test('it binds a retirement to the version the session read and keeps its item source', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-3',
        {
          shortID: 'p2v7h5j9ze',
          version: 1,
          text: 'Is in Lisbon until May',
          source: 'owner_data',
          isPinned: false,
        },
      ],
    ]),
    30,
  );

  staging.stage([{ kind: 'retire', itemIDs: ['item-3'], reason: 'The trip has ended.' }]);

  expect(run.close()).toStrictEqual([
    {
      kind: 'retire',
      inputs: [{ itemID: 'item-3', version: 1 }],
      reason: 'The trip has ended.',
      source: 'owner_data',
    },
  ]);
});

test('it puts a pinned input first in a merge, so the merged item stays pinned', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-1',
        {
          shortID: 'k3x9m2p7qa',
          version: 1,
          text: 'Has a peanut allergy',
          source: 'owner',
          isPinned: false,
        },
      ],
      [
        'item-2',
        {
          shortID: 'w8n4c6t1rb',
          version: 3,
          text: 'Is allergic to peanuts',
          source: 'owner',
          isPinned: true,
        },
      ],
    ]),
    30,
  );

  staging.stage([
    {
      kind: 'merge',
      itemIDs: ['item-1', 'item-2'],
      text: 'Is allergic to peanuts',
      reason: 'Both items state the same allergy.',
    },
  ]);

  expect(run.close()).toMatchObject([
    {
      inputs: [
        { itemID: 'item-2', version: 3 },
        { itemID: 'item-1', version: 1 },
      ],
    },
  ]);
});

test('it binds a change to the version a recall showed the session', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(new Map(), 30);

  staging.show('item-9', {
    shortID: 'f6q1y8d3mu',
    version: 4,
    text: 'owner likes. tea green',
    source: 'owner',
    isPinned: false,
  });
  staging.stage([
    {
      kind: 'rewrite',
      itemIDs: ['item-9'],
      text: 'Likes green tea',
      reason: 'The wording was garbled.',
    },
  ]);

  expect(run.close()).toStrictEqual([
    {
      kind: 'rewrite',
      inputs: [{ itemID: 'item-9', version: 4 }],
      text: 'Likes green tea',
      reason: 'The wording was garbled.',
      source: 'owner',
    },
  ]);
  expect(run.countShown()).toBe(1);
});

test('it stages an empty diff when nothing needs tidying', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(new Map(), 30);

  const result = staging.stage([]);

  expect(result).toStrictEqual({ status: 'staged', changes: 0 });
  expect(run.close()).toStrictEqual([]);
});

test('it closes with no diff when the session staged none', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(new Map(), 30);

  expect(run.close()).toBeNull();
});

test('it refuses a second diff in one run', () => {
  const staging = createConsolidationStaging();

  staging.open(new Map(), 30);
  staging.stage([]);

  expect(staging.stage([])).toStrictEqual({
    status: 'refused',
    reason: 'this run already proposed its diff',
  });
});

test('it refuses a diff when no run is open', () => {
  const staging = createConsolidationStaging();

  expect(staging.stage([])).toStrictEqual({
    status: 'refused',
    reason: 'no consolidation run is open',
  });
});

test('it refuses a diff from a run that a newer run replaced', () => {
  const staging = createConsolidationStaging();
  const old = staging.open(new Map(), 30);
  const current = staging.open(new Map(), 30);

  old.close();
  staging.stage([]);

  expect(current.close()).toStrictEqual([]);
});

test('it refuses a diff over the most changes a run allows', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
      [
        'item-2',
        {
          shortID: 'w8n4c6t1rb',
          version: 1,
          text: 'Sings in a choir',
          source: 'owner',
          isPinned: false,
        },
      ],
    ]),
    1,
  );

  expect(
    staging.stage([
      { kind: 'retire', itemIDs: ['item-1'], reason: 'Stale.' },
      { kind: 'retire', itemIDs: ['item-2'], reason: 'Stale.' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'a diff holds at most 1 changes; keep the most useful ones',
  });
});

test('it takes the short ID the session read, and binds the change to the item it names', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 2, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  staging.stage([{ kind: 'retire', itemIDs: ['k3x9m2p7qa'], reason: 'Stale.' }]);

  expect(run.close()).toMatchObject([{ inputs: [{ itemID: 'item-1', version: 2 }] }]);
});

test('it refuses a diff that names one item in 2 changes, by its short ID and its item ID', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  expect(
    staging.stage([
      { kind: 'rewrite', itemIDs: ['k3x9m2p7qa'], text: 'Keeps honeybees', reason: 'Clearer.' },
      { kind: 'retire', itemIDs: ['item-1'], reason: 'Stale.' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'item k3x9m2p7qa is named more than once; name each item at most once',
  });
});

test('it refuses a change to an item the session was never shown, and stages nothing', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  const result = staging.stage([
    { kind: 'retire', itemIDs: ['item-1'], reason: 'Stale.' },
    { kind: 'retire', itemIDs: ['item-7'], reason: 'Stale.' },
  ]);

  expect(result).toStrictEqual({
    status: 'refused',
    reason: 'change 2: item item-7 is not one you were shown; find it with memory.recall first',
  });
  expect(run.close()).toBeNull();
});

test.each([
  [
    'a merge of one item',
    { kind: 'merge', itemIDs: ['item-1'], text: 'Keeps bees' },
    'a merge names 2 or more items and gives the merged text',
  ],
  [
    'a merge with no text',
    { kind: 'merge', itemIDs: ['item-1', 'item-2'] },
    'a merge names 2 or more items and gives the merged text',
  ],
  [
    'a rewrite of 2 items',
    { kind: 'rewrite', itemIDs: ['item-1', 'item-2'], text: 'Keeps bees' },
    'a rewrite names exactly one item',
  ],
  [
    'a rewrite with blank text',
    { kind: 'rewrite', itemIDs: ['item-1'], text: '  ' },
    'a rewrite gives the new text',
  ],
  [
    'a retirement of 2 items',
    { kind: 'retire', itemIDs: ['item-1', 'item-2'] },
    'a retirement names exactly one item',
  ],
  [
    'a retirement with text',
    { kind: 'retire', itemIDs: ['item-1'], text: 'Keeps bees' },
    'a retirement gives no text',
  ],
] as const)('it refuses %s', (_label, request, reason) => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
      [
        'item-2',
        {
          shortID: 'w8n4c6t1rb',
          version: 1,
          text: 'Keeps honeybees',
          source: 'owner',
          isPinned: false,
        },
      ],
    ]),
    30,
  );

  expect(staging.stage([{ ...request, reason: 'Tidier.' }])).toStrictEqual({
    status: 'refused',
    reason: `change 1: ${reason}`,
  });
});

test('it refuses a change with no reason the owner can read', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  expect(staging.stage([{ kind: 'retire', itemIDs: ['item-1'], reason: ' ' }])).toStrictEqual({
    status: 'refused',
    reason: 'change 1: give a reason the owner can read',
  });
});

test('it refuses new text that holds an invisible formatting character', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  expect(
    staging.stage([
      { kind: 'rewrite', itemIDs: ['item-1'], text: 'Keeps\u200B bees', reason: 'Clearer.' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'change 1: the text holds an invisible formatting character',
  });
});

test('it refuses new text that brings in a destination none of its items holds', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        {
          shortID: 'k3x9m2p7qa',
          version: 1,
          text: 'Banks with the credit union',
          source: 'owner',
          isPinned: false,
        },
      ],
    ]),
    30,
  );

  expect(
    staging.stage([
      {
        kind: 'rewrite',
        itemIDs: ['item-1'],
        text: 'Banks with the credit union at pay.example.test',
        reason: 'Clearer.',
      },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'change 1: the text holds pay.example.test, which none of its items holds',
  });
});

test('it keeps a destination that one of the merged items holds', () => {
  const staging = createConsolidationStaging();
  const run = staging.open(
    new Map([
      [
        'item-1',
        {
          shortID: 'k3x9m2p7qa',
          version: 1,
          text: 'Email is sam@example.test',
          source: 'owner',
          isPinned: false,
        },
      ],
      [
        'item-2',
        {
          shortID: 'w8n4c6t1rb',
          version: 1,
          text: 'Uses email for work',
          source: 'owner',
          isPinned: false,
        },
      ],
    ]),
    30,
  );

  staging.stage([
    {
      kind: 'merge',
      itemIDs: ['item-1', 'item-2'],
      text: 'Uses sam@example.test for work email',
      reason: 'Both items describe the same address.',
    },
  ]);

  expect(run.close()).toMatchObject([
    { kind: 'merge', text: 'Uses sam@example.test for work email' },
  ]);
});

test('it refuses a rewrite that keeps the current text', () => {
  const staging = createConsolidationStaging();

  staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  expect(
    staging.stage([
      { kind: 'rewrite', itemIDs: ['item-1'], text: 'Keeps bees', reason: 'Tidier.' },
    ]),
  ).toStrictEqual({
    status: 'refused',
    reason: 'change 1: the new text is the same as the current text',
  });
});
