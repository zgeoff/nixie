import { expect, test } from 'bun:test';
import { findTurnEnd } from './find-turn-end.ts';

test('it ends a silence-only turn at the first pause longer than the silence setting', () => {
  expect(
    findTurnEnd(
      [
        { answers: {}, resumeMs: 1300, speechEndMs: 1000 },
        { answers: {}, resumeMs: 2700, speechEndMs: 2000 },
        { answers: {}, speechEndMs: 4000 },
      ],
      [],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: true, endMs: 2500, waitMs: -1500 });
});

test('it waits the shortest time after the last speech when the detector is sure', () => {
  expect(
    findTurnEnd(
      [{ answers: { smartTurn: { answeredAfterMs: 150, probability: 1 } }, speechEndMs: 3000 }],
      ['smartTurn'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: false, endMs: 3200, waitMs: 200 });
});

test('it waits up to the longest time when the detector is unsure', () => {
  expect(
    findTurnEnd(
      [{ answers: { clef: { answeredAfterMs: 300, probability: 0 } }, speechEndMs: 3000 }],
      ['clef'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: false, endMs: 4200, waitMs: 1200 });
});

test('it never ends the turn before the slowest answer arrives', () => {
  expect(
    findTurnEnd(
      [{ answers: { jev: { answeredAfterMs: 900, probability: 1 } }, speechEndMs: 3000 }],
      ['jev'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: false, endMs: 3900, waitMs: 900 });
});

test('it keeps listening when speech resumes before an unsure wait runs out', () => {
  expect(
    findTurnEnd(
      [
        { answers: { jev: { answeredAfterMs: 300, probability: 0.2 } }, resumeMs: 1800, speechEndMs: 1000 },
        { answers: { jev: { answeredAfterMs: 300, probability: 0.9 } }, speechEndMs: 4000 },
      ],
      ['jev'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: false, endMs: 4300, waitMs: 300 });
});

test('it averages the probabilities of a combined candidate', () => {
  expect(
    findTurnEnd(
      [
        {
          answers: {
            clef: { answeredAfterMs: 250, probability: 0.2 },
            smartTurn: { answeredAfterMs: 240, probability: 0.8 },
          },
          speechEndMs: 2000,
        },
      ],
      ['smartTurn', 'clef'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ cutOff: false, endMs: 2700, waitMs: 700 });
});

test('it reports a failed answer instead of reading it as a turn that goes on', () => {
  expect(
    findTurnEnd(
      [
        { answers: { clef: { error: 'clef: HTTP 429' } }, resumeMs: 1800, speechEndMs: 1000 },
        { answers: { clef: { answeredAfterMs: 300, probability: 0.9 } }, speechEndMs: 4000 },
      ],
      ['clef'],
      { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 },
      9000,
    ),
  ).toStrictEqual({ error: 'clef: HTTP 429' });
});

test('it finds no turn end in an utterance with no speech', () => {
  expect(findTurnEnd([], [], { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 }, 9000)).toBeUndefined();
});

test('it counts the wait from the end of a recording that stops before the voice detector lets go', () => {
  expect(
    findTurnEnd([{ answers: {}, speechEndMs: 3400 }], [], { maxWaitMs: 1200, minWaitMs: 200, silenceMs: 500 }, 2800),
  ).toStrictEqual({ cutOff: false, endMs: 3900, waitMs: 1100 });
});
