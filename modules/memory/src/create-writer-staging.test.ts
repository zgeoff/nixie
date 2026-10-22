import { expect, test } from 'bun:test';
import { createWriterStaging } from './create-writer-staging';

test('it stages a new item that cites one of your messages in the batch', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I play the cello',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner plays the cello.',
    quote: 'I play the cello',
    sourceSequence: 7,
    itemID: null,
  });

  expect(result).toStrictEqual({ status: 'staged' });
});

test('it stages a new item with the end time it is given', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: "I'm in Lisbon this week",
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: 'Europe/Lisbon',
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner is in Lisbon this week.',
    quote: "I'm in Lisbon this week",
    sourceSequence: 7,
    itemID: null,
    until: Date.parse('2026-10-25T23:59:59Z'),
  });

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'The owner is in Lisbon this week.',
      quote: "I'm in Lisbon this week",
      sourceSequence: 7,
      target: null,
      until: Date.parse('2026-10-25T23:59:59Z'),
    },
  ]);
});

test('it refuses a write whose end time passed before the batch ran, and stages nothing', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: "I'm in Lisbon today",
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: 'Europe/Lisbon',
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-20T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner is in Lisbon today.',
    quote: "I'm in Lisbon today",
    sourceSequence: 7,
    itemID: null,
    until: Date.parse('2026-10-19T22:59:59Z'),
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason:
      'that end time passed before this batch ran, so the fact has already lapsed; stage nothing for it',
  });

  expect(staged.close()).toStrictEqual([]);
});

test('it stages an edit that clears the end time of its item', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: "I'm staying in Lisbon for good",
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-trip', { version: 2, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner lives in Lisbon.',
    quote: "I'm staying in Lisbon for good",
    sourceSequence: 7,
    itemID: 'item-trip',
    until: null,
  });

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'The owner lives in Lisbon.',
      quote: "I'm staying in Lisbon for good",
      sourceSequence: 7,
      target: { itemID: 'item-trip', version: 2 },
      until: null,
    },
  ]);
});

test('it returns the staged writes in order when the batch closes', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I moved to Marlow Vale',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-home', { version: 3, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner lives in Marlow Vale.',
    quote: 'I moved to Marlow Vale',
    sourceSequence: 7,
    itemID: 'item-home',
  });

  staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner moved.',
    quote: 'I moved',
    sourceSequence: 7,
    itemID: null,
  });

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'owner',
      text: 'The owner lives in Marlow Vale.',
      quote: 'I moved to Marlow Vale',
      sourceSequence: 7,
      target: { itemID: 'item-home', version: 3 },
    },
    {
      op: 'remember',
      subject: 'owner',
      text: 'The owner moved.',
      quote: 'I moved',
      sourceSequence: 7,
      target: null,
    },
  ]);
});

test('it binds a retirement to the version the session was shown', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I sold the bike',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-bike', { version: 2, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({ op: 'retire', quote: 'I sold the bike', sourceSequence: 7, itemID: 'item-bike' });

  expect(staged.close()).toStrictEqual([
    {
      op: 'retire',
      quote: 'I sold the bike',
      sourceSequence: 7,
      target: { itemID: 'item-bike', version: 2 },
    },
  ]);
});

test('it binds a change to an item a recall showed the session', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I sold the bike',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.show('item-bike', { version: 5, subject: 'owner' }, 'The owner rides a red bike.');
  staging.stage({ op: 'retire', quote: 'I sold the bike', sourceSequence: 7, itemID: 'item-bike' });

  expect(staged.close()).toStrictEqual([
    {
      op: 'retire',
      quote: 'I sold the bike',
      sourceSequence: 7,
      target: { itemID: 'item-bike', version: 5 },
    },
  ]);
});

test('it refuses a write citing a message outside the batch', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I play the cello',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner plays the cello.',
    quote: 'I play the cello',
    sourceSequence: 8,
    itemID: null,
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: "sourceID 8 is not one of the owner's messages in this batch",
  });
});

test('it refuses a change to an item the session was never shown', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I play the cello',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner plays the cello.',
    quote: 'I play the cello',
    sourceSequence: 7,
    itemID: 'item-music',
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: 'item item-music is not one you were shown; find it with memory.recall first',
  });
});

test('it refuses a retirement of an item the session was never shown', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I sold the bike',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'retire',
    quote: 'I sold the bike',
    sourceSequence: 7,
    itemID: 'item-bike',
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: 'item item-bike is not one you were shown; find it with memory.recall first',
  });
});

test('it refuses a second change to the same item in a batch', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I sold the bike',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-bike', { version: 2, subject: 'owner' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({ op: 'retire', quote: 'I sold the bike', sourceSequence: 7, itemID: 'item-bike' });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner sold the bike.',
    quote: 'I sold the bike',
    sourceSequence: 7,
    itemID: 'item-bike',
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: 'item item-bike already has a change in this batch; change each item at most once',
  });
});

test('it refuses a write when no batch is open', () => {
  const staging = createWriterStaging();

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner moved.',
    quote: 'I moved',
    sourceSequence: 7,
    itemID: null,
  });

  expect(result).toStrictEqual({ status: 'refused', reason: 'no batch is open' });
});

test('it refuses a write once the batch closes', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I moved',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staged.close();

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner moved.',
    quote: 'I moved',
    sourceSequence: 7,
    itemID: null,
  });

  expect(result).toStrictEqual({ status: 'refused', reason: 'no batch is open' });
});

test('it keeps the text of each item a recall showed the batch', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I sold the bike',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.show('item-bike', { version: 5, subject: 'owner' }, 'The owner rides a red bike.');

  expect(staged.readRecalledTexts()).toStrictEqual(new Set(['The owner rides a red bike.']));
});

test('it refuses an edit that changes the subject of its item', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'Our deal is tea on Fridays',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-deal', { version: 1, subject: 'shared' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner drinks tea on Fridays.',
    quote: 'tea on Fridays',
    sourceSequence: 7,
    itemID: 'item-deal',
  });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: "item item-deal has the subject shared; an edit keeps its item's subject",
  });
});

test('it binds an edit of a shared item that keeps its subject', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'Our deal is tea on Fridays now',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map([['item-deal', { version: 1, subject: 'shared' }]]),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.stage({
    op: 'remember',
    subject: 'shared',
    text: 'The owner and the assistant have tea on Fridays.',
    quote: 'tea on Fridays',
    sourceSequence: 7,
    itemID: 'item-deal',
  });

  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      subject: 'shared',
      text: 'The owner and the assistant have tea on Fridays.',
      quote: 'tea on Fridays',
      sourceSequence: 7,
      target: { itemID: 'item-deal', version: 1 },
    },
  ]);
});

test('it keeps each flag in the order the session flagged it, and stages no write for it', () => {
  const staging = createWriterStaging();

  const staged = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'You love puns, admit it',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.flag({ text: 'The assistant enjoys puns.', sourceSequence: 7 });
  staging.flag({ text: 'The assistant denies enjoying puns.', sourceSequence: 7 });

  expect(staged.readFlags()).toStrictEqual([
    { text: 'The assistant enjoys puns.', sourceSequence: 7 },
    { text: 'The assistant denies enjoying puns.', sourceSequence: 7 },
  ]);

  expect(staged.close()).toStrictEqual([]);
});

test('it refuses a flag citing a message outside the batch', () => {
  const staging = createWriterStaging();

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'You love puns, admit it',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  const result = staging.flag({ text: 'The assistant enjoys puns.', sourceSequence: 9 });

  expect(result).toStrictEqual({
    status: 'refused',
    reason: "sourceID 9 is not one of the owner's messages in this batch",
  });
});

test('it refuses a flag when no batch is open', () => {
  const staging = createWriterStaging();
  const result = staging.flag({ text: 'The assistant enjoys puns.', sourceSequence: 7 });

  expect(result).toStrictEqual({ status: 'refused', reason: 'no batch is open' });
});

test('it keeps a newer batch open when an older batch closes', () => {
  const staging = createWriterStaging();

  const older = staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I moved',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  staging.open({
    sources: new Map([
      [
        7,
        {
          sequence: 7,
          text: 'I moved',
          spans: [],
          sentAt: Date.parse('2026-10-19T09:00:00Z'),
          timeZone: null,
        },
      ],
    ]),
    shown: new Map(),
    startedAt: Date.parse('2026-10-19T10:00:00Z'),
  });

  older.close();

  const result = staging.stage({
    op: 'remember',
    subject: 'owner',
    text: 'The owner moved.',
    quote: 'I moved',
    sourceSequence: 7,
    itemID: null,
  });

  expect(result).toStrictEqual({ status: 'staged' });
});
