import { expect, test } from 'bun:test';
import { pickWaitTelling } from './pick-wait-telling';

test.each<{ name: string; sent: number[]; told: number[]; tells: number[] }>([
  { name: 'a notice past the batch that no turn told', sent: [1, 2], told: [], tells: [3] },
  { name: 'a notice past the batch that an earlier turn told', sent: [1, 2], told: [3], tells: [] },
  { name: 'a notice inside the batch', sent: [1, 2, 3], told: [], tells: [] },
])('it tells $tells for $name', (row) => {
  const inbox = [
    { kind: 'owner_message' as const, sequence: 1 },
    { kind: 'owner_message' as const, sequence: 2 },
    { kind: 'spend.wait_notice' as const, sequence: 3 },
  ];

  const tells = pickWaitTelling(inbox, new Set(row.sent), new Set(row.told));

  expect(tells.map((record) => record.sequence)).toStrictEqual(row.tells);
});
