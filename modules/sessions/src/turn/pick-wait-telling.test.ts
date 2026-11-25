import { expect, test } from 'bun:test';
import { pickWaitTelling } from './pick-wait-telling';

test.each<{
  name: string;
  sent: number[];
  toldThrough: number;
  told: number[];
  through: number | null;
}>([
  {
    name: 'a notice past the batch that no turn told',
    sent: [1, 2],
    toldThrough: 0,
    told: [3],
    through: 3,
  },
  {
    name: 'a notice past the batch that an earlier turn told',
    sent: [1, 2],
    toldThrough: 3,
    told: [],
    through: 3,
  },
  { name: 'a notice inside the batch', sent: [1, 2, 3], toldThrough: 0, told: [], through: null },
])('it tells $told and marks $through for $name', (row) => {
  const inbox = [
    { kind: 'owner_message' as const, sequence: 1 },
    { kind: 'owner_message' as const, sequence: 2 },
    { kind: 'spend.wait_notice' as const, sequence: 3 },
  ];

  const telling = pickWaitTelling(inbox, new Set(row.sent), row.toldThrough);

  expect({
    told: telling.told.map((record) => record.sequence),
    through: telling.toldThrough,
  }).toStrictEqual({ told: row.told, through: row.through });
});
