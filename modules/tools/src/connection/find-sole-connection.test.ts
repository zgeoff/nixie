import { expect, test } from 'bun:test';
import { findSoleConnection } from './find-sole-connection';

test.each([
  { pinned: ['k3x9m2p7qa'], live: ['k3x9m2p7qa'], expected: 'k3x9m2p7qa' },
  { pinned: ['k3x9m2p7qa', 'p8d2v6n4rc'], live: ['p8d2v6n4rc'], expected: 'p8d2v6n4rc' },
  { pinned: ['k3x9m2p7qa', 'p8d2v6n4rc'], live: ['k3x9m2p7qa', 'p8d2v6n4rc'], expected: null },
  { pinned: ['k3x9m2p7qa'], live: [], expected: null },
  { pinned: undefined, live: ['k3x9m2p7qa'], expected: null },
])('it finds $expected for pins $pinned with live $live', (row) => {
  expect(findSoleConnection(row.pinned, new Set(row.live))).toBe(row.expected);
});
