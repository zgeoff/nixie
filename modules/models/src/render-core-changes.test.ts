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
    new Map(),
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
    new Map(),
  );

  expect(note).toBeNull();
});

test('it notes each item pinned, edited and unpinned since the last turn by its short ID', () => {
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
        recordedAt: 2_000_000,
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
        recordedAt: 1_000_000,
        text: 'Uses they/them',
      },
    ],
    new Map([['7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001', 'r2vd6t0jmy']]),
  );

  expect(note).toMatchInlineSnapshot(`
    "The pinned memory changed since your last turn. Where these differ from the pinned memory this session opened with, or from anything said earlier, these hold.
    - Changed [h4ns8w1cpe]: Goes by Sasha
    - Pinned [b7kq2m9xza]: Uses they/them
    - Unpinned [r2vd6t0jmy]"
  `);
});
