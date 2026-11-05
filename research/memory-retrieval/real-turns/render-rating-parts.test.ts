import { expect, test } from 'bun:test';
import { parseLabelLines } from './parse-label-lines.ts';
import { renderRatingParts } from './render-rating-parts.ts';

test('it shows example answers that parse as labels with misleading and missing lists', () => {
  const [part] = renderRatingParts([{ caseID: 't1', earlier: [], message: 'ok', reply: 'Noted.', items: [] }], 10);

  expect(parseLabelLines(part ?? '', new Set(['t123', 't456'])).labels).toStrictEqual([
    { caseID: 't123', relevant: ['M2', 'P1'], best: 'M2', misleading: ['M4'], missing: [], by: 'assistant' },
    { caseID: 't456', relevant: [], best: null, misleading: [], missing: ['the ferry timetable'], by: 'assistant' },
  ]);
});

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
