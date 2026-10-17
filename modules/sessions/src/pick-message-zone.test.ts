import { expect, test } from 'bun:test';
import { pickMessageZone } from './pick-message-zone';

test('it picks the zone the message names when the runtime knows it', () => {
  expect(pickMessageZone('Asia/Tokyo', 'Europe/London')).toBe('Asia/Tokyo');
});

test('it picks the default zone for a missing or unknown zone', () => {
  expect(
    [undefined, 'Atlantis/Poseidonia', 42].map((zone) => pickMessageZone(zone, 'UTC')),
  ).toStrictEqual(['UTC', 'UTC', 'UTC']);
});
