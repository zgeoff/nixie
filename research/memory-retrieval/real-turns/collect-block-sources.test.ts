import { expect, test } from 'bun:test';
import { collectBlockSources } from './collect-block-sources.ts';

test('it takes each version line from the export', () => {
  const sources = collectBlockSources({
    records: [],
    items: [
      {
        item_id: 'item-b',
        version: 1,
        state: 'active',
        is_pinned: 0,
        pinned_sequence: null,
        created_sequence: 1,
        short_id: 'm7',
        kind: 'fact',
        subject: 'owner',
      },
    ],
    versions: [
      {
        item_id: 'item-b',
        version: 1,
        change: 'created',
        state: 'active',
        sequence: 1,
        until: null,
        status: 'readable',
        text: 'Owns a narrowboat',
        quote: 'we bought the boat',
        origin: 'conversation',
        source: 'owner',
        recorded_at: 1000,
      },
    ],
    notes: [],
  });

  expect(sources).toStrictEqual({
    versions: new Map([
      ['item-b@1', { shortID: 'm7', subject: 'owner', origin: 'conversation', source: 'owner', recordedAt: 1000, quote: 'we bought the boat' }],
    ]),
  });
});
