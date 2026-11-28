import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { collectPlaceNarrowings } from './collect-place-narrowings';

test('it gathers the notice of each narrowed place in record order and skips other records', () => {
  const narrowings = collectPlaceNarrowings([
    buildMockLogRecord({
      kind: 'places.narrowed',
      placeNarrowed: { place: 'tickets.example.com', trust: 'read', isRemoved: false },
    }),
    buildMockLogRecord({ kind: 'model.turn_ended' }),
    buildMockLogRecord({
      kind: 'places.narrowed',
      placeNarrowed: { place: 'sam@example.org', isRemoved: true },
    }),
  ]);

  expect(narrowings).toStrictEqual([
    { place: 'tickets.example.com', trust: 'read', isRemoved: false },
    { place: 'sam@example.org', isRemoved: true },
  ]);
});
