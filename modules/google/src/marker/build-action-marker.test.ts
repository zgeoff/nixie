import { expect, test } from 'bun:test';
import {
  buildActionMarker,
  collectMarkerKeys,
  collectStaleMarkerKeys,
  isMarkerKept,
  isMarkerLossProvable,
} from './build-action-marker';

test('#collectStaleMarkerKeys and #isMarkerKept drop the incoming marker, not a newer one, when 10 newer markers are stored', () => {
  const properties = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(100 + index),
    ]),
  );

  const delayed = buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 1);

  expect([
    collectStaleMarkerKeys(properties, delayed),
    isMarkerKept(properties, delayed),
  ]).toStrictEqual([[], false]);
});

test('#isMarkerKept keeps a marker that is among the 10 newest', () => {
  const properties = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(100 + index),
    ]),
  );

  const incoming = buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 105);

  expect([
    isMarkerKept(properties, incoming),
    collectStaleMarkerKeys(properties, incoming),
  ]).toStrictEqual([true, [`nixie${String(0).padStart(32, '0')}`]]);
});

test('#buildActionMarker keys the marker by the action ID without hyphens and values it by the queued time', () => {
  const actionHex = '0b9d3c4e7a214f0e8c551e6f2a9d4c03';

  expect(buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 1_794_550_000)).toStrictEqual({
    key: `nixie${actionHex}`,
    value: '1794550000',
  });
});

test('#collectMarkerKeys leaves out a property that is no marker', () => {
  expect(
    collectMarkerKeys({ [`nixie${String(1).padStart(32, '0')}`]: '1', nixiefoo: '2', other: '3' }),
  ).toStrictEqual([`nixie${String(1).padStart(32, '0')}`]);
});

test('#collectStaleMarkerKeys keeps the new marker and the 9 newest of the rest', () => {
  const properties = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(100 + index),
    ]),
  );

  const marker = buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 999);

  expect(collectStaleMarkerKeys(properties, marker)).toStrictEqual([
    `nixie${String(2).padStart(32, '0')}`,
    `nixie${String(1).padStart(32, '0')}`,
    `nixie${String(0).padStart(32, '0')}`,
  ]);
});

test('#collectStaleMarkerKeys deletes none while the item holds fewer than 10 markers', () => {
  const properties = {
    [`nixie${String(1).padStart(32, '0')}`]: '1',
    [`nixie${String(2).padStart(32, '0')}`]: '2',
  };

  expect(
    collectStaleMarkerKeys(
      properties,
      buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 3),
    ),
  ).toStrictEqual([]);
});

test('#collectStaleMarkerKeys never deletes the marker it keeps', () => {
  const marker = buildActionMarker('0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03', 5);

  const properties = Object.fromEntries<string>([
    [marker.key, '5'],
    ...Array.from({ length: 10 }, (_, index): [string, string] => [
      `nixie${String(index).padStart(32, '0')}`,
      String(100 + index),
    ]),
  ]);

  expect(collectStaleMarkerKeys(properties, marker)).not.toContain(marker.key);
});

test.each([
  { count: 9, expected: true },
  { count: 10, expected: false },
])('#isMarkerLossProvable answers $expected for $count markers', (row) => {
  const properties = Object.fromEntries(
    Array.from({ length: row.count }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      '1',
    ]),
  );

  expect(isMarkerLossProvable(properties)).toBe(row.expected);
});
