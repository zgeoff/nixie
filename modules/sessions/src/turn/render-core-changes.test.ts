import { expect, test } from 'bun:test';
import { renderCoreChanges } from './render-core-changes';

test('it renders no note before the first turn', () => {
  const note = renderCoreChanges(
    null,
    [
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        version: 1,
        origin: 'conversation',
        source: 'owner',
        evidenceQuote: null,
        approval: null,
        recordedAt: 1_000_000,
        text: 'Uses they/them',
      },
    ],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map(),
      use: { items: 1, tokens: 31, budget: 2000 },
    },
  );

  expect(note).toBeNull();
});

test('it renders no note when the pinned core is unchanged', () => {
  const note = renderCoreChanges(
    [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
    [
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        version: 1,
        origin: 'conversation',
        source: 'owner',
        evidenceQuote: null,
        approval: null,
        recordedAt: 1_000_000,
        text: 'Uses they/them',
      },
    ],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map(),
      use: { items: 1, tokens: 31, budget: 2000 },
    },
  );

  expect(note).toBeNull();
});

test('it notes each item pinned and edited since the last turn in full, and each unpinned one by its short ID', () => {
  const note = renderCoreChanges(
    [
      { itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f', version: 1 },
      { itemID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001', version: 1 },
    ],
    [
      {
        itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        shortID: 'h4ns8w1cpe',
        version: 2,
        origin: 'conversation',
        source: 'owner',
        evidenceQuote: null,
        approval: null,
        recordedAt: Date.parse('2026-10-13T09:00:00Z'),
        text: 'Goes by Sasha',
      },
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        version: 1,
        origin: 'conversation',
        source: 'owner',
        evidenceQuote: null,
        approval: null,
        recordedAt: Date.parse('2026-10-12T09:00:00Z'),
        text: 'Uses they/them',
      },
    ],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map([['7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001', 'r2vd6t0jmy']]),
      use: { items: 2, tokens: 64, budget: 2000 },
    },
  );

  expect(note).toMatchInlineSnapshot(`
    "The pinned memory changed since your last turn. Where these differ from the pinned memory this session opened with, or from anything said earlier, these hold.
    - Changed [h4ns8w1cpe]:
      - Goes by Sasha
        h4ns8w1cpe v2 · 13 Oct · you noted it · the owner said this
    - Pinned [b7kq2m9xza]:
      - Uses they/them
        b7kq2m9xza v1 · 12 Oct · you noted it · the owner said this
    - Unpinned [r2vd6t0jmy]
    Pinned memory now: 2 items, 64 of 2000 tokens."
  `);
});

test('it gives the count and the tokens of an empty core after the last item is unpinned', () => {
  const note = renderCoreChanges(
    [{ itemID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001', version: 3 }],
    [],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map([['7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001', 'r2vd6t0jmy']]),
      use: { items: 0, tokens: 0, budget: 1500 },
    },
  );

  expect(note).toEndWith('- Unpinned [r2vd6t0jmy]\nPinned memory now: 0 items, 0 of 1500 tokens.');
});

test('it counts a core of one item as 1 item', () => {
  const note = renderCoreChanges(
    [],
    [
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        version: 1,
        origin: 'conversation',
        source: 'owner',
        evidenceQuote: null,
        approval: null,
        recordedAt: Date.parse('2026-10-12T09:00:00Z'),
        text: 'Uses they/them',
      },
    ],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map(),
      use: { items: 1, tokens: 31, budget: 2000 },
    },
  );

  expect(note).toEndWith('\nPinned memory now: 1 item, 31 of 2000 tokens.');
});

test('it keeps where a changed item came from, so an unconfirmed edit still reads as unconfirmed', () => {
  const note = renderCoreChanges(
    [{ itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f', version: 1 }],
    [
      {
        itemID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
        shortID: 'h4ns8w1cpe',
        version: 2,
        origin: 'memory_writer',
        source: 'untrusted',
        evidenceQuote: 'the clinic moved to Elm Street',
        approval: null,
        recordedAt: Date.parse('2026-10-13T09:00:00Z'),
        text: 'The clinic is on Elm Street',
      },
    ],
    {
      ownerName: null,
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
      unpinnedShortIDs: new Map(),
      use: { items: 1, tokens: 31, budget: 2000 },
    },
  );

  expect(note).toInclude(
    '\n- Changed [h4ns8w1cpe]:\n  - The clinic is on Elm Street\n    h4ns8w1cpe v2 · 13 Oct · the note-taker noted it · unconfirmed\n    How it came up: "the clinic moved to Elm Street"',
  );
});
