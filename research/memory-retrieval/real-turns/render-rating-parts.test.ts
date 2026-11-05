import { expect, test } from 'bun:test';
import { renderRatingParts } from './render-rating-parts.ts';

test('it splits the turns into parts that each open with the instructions', () => {
  const turn = (caseID: string) => ({ caseID, earlier: [], message: 'ok', reply: 'Noted.', items: [] });

  const parts = renderRatingParts([turn('t1'), turn('t2'), turn('t3')], 2);

  expect(parts.map((part) => part.split('\n')[0])).toStrictEqual(['# Memory rating, part 1 of 2', '# Memory rating, part 2 of 2']);
});

test('it writes each text as one JSON string, so a heading inside a message stays inside it', () => {
  const [part] = renderRatingParts(
    [{ caseID: 't1', earlier: [], message: 'see below\n## not a turn', reply: 'Seen.', items: [{ ref: 'M1', text: 'Reads\nslowly' }] }],
    10,
  );

  expect(part?.split('\n').filter((line) => line.startsWith('## '))).toStrictEqual(['## t1']);
});
