import { expect, test } from 'bun:test';
import { buildStatusRegistry } from './build-status-registry';

test('it keeps the entries in the order given, so a new line is one more entry', () => {
  const tide = { name: 'tide', read: () => Promise.resolve({ value: 'high', text: 'Tide: high' }) };
  const moon = { name: 'moon', read: () => Promise.resolve({ value: 'full', text: 'Moon: full' }) };

  expect(buildStatusRegistry([tide, moon])).toStrictEqual([tide, moon]);
});

test('it refuses two entries with one name', () => {
  const tide = { name: 'tide', read: () => Promise.resolve({ value: 'high', text: 'Tide: high' }) };

  expect(() => buildStatusRegistry([tide, tide])).toThrowWithMessage(
    Error,
    'the status has two entries named tide',
  );
});
