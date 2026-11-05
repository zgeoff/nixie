import { expect, test } from 'bun:test';
import { renderRatingParts } from './render-rating-parts.ts';

test('it splits the turns into parts that each open with the instructions', () => {
  const turn = (caseID: string) => ({ caseID, earlier: [], message: 'ok', reply: 'Noted.', items: [] });

  const parts = renderRatingParts([turn('t1'), turn('t2'), turn('t3')], 2);

  expect(parts.map((part) => part.split('\n')[0])).toStrictEqual(['# Memory rating, part 1 of 2', '# Memory rating, part 2 of 2']);
});

test('it puts each turn, with its message and reply, in the part its position falls in', () => {
  const parts = renderRatingParts(
    [
      { caseID: 't1', earlier: [], message: 'fix the gate', reply: 'Fixed.', items: [] },
      { caseID: 't2', earlier: [], message: 'water the ferns', reply: 'Done.', items: [] },
      { caseID: 't3', earlier: [], message: 'book the kiln', reply: 'Booked.', items: [] },
    ],
    2,
  );

  expect(parts.map((part) => part.split('\n').filter((line) => /^(## |Message: |Your reply: )/.test(line)))).toStrictEqual([
    ['## t1', 'Message: "fix the gate"', 'Your reply: "Fixed."', '## t2', 'Message: "water the ferns"', 'Your reply: "Done."'],
    ['## t3', 'Message: "book the kiln"', 'Your reply: "Booked."'],
  ]);
});

test('it writes each text as one JSON string, so a heading inside a message stays inside it', () => {
  const [part] = renderRatingParts(
    [{ caseID: 't1', earlier: [], message: 'see below\n## not a turn', reply: 'Seen.', items: [{ ref: 'M1', text: 'Reads\nslowly' }] }],
    10,
  );

  expect(part?.split('\n').filter((line) => line.startsWith('## '))).toStrictEqual(['## t1']);
});
