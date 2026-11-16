import { expect, test } from 'bun:test';
import type { WorkerEndFacts } from './pick-worker-end';
import { pickWorkerEnd } from './pick-worker-end';
import type { WorkerEnd } from './types';

test.each<[string, Partial<WorkerEndFacts>, WorkerEnd]>([
  [
    'an aborted step',
    { isAborted: true, turn: { ended: 'finished', failure: null, answer: 'Three cafes.' } },
    { outcome: 'aborted' },
  ],
  [
    'the minutes up with an answer in hand',
    { isMinutesUp: true, turn: { ended: 'finished', failure: null, answer: 'Three cafes.' } },
    { outcome: 'limit', limit: 'minutes' },
  ],
  [
    'a throw while starting',
    { error: 'no image', stage: 'starting' },
    { outcome: 'sandbox_failed', detail: 'no image' },
  ],
  [
    'a throw while running',
    { error: 'socket closed' },
    { outcome: 'model_failed', detail: 'socket closed' },
  ],
  ['no turn', { turn: null }, { outcome: 'model_failed', detail: 'the guest sent no turn' }],
  [
    'a failed frame',
    { turn: { ended: null, failure: 'rate limited', answer: '' } },
    { outcome: 'model_failed', detail: 'rate limited' },
  ],
  [
    'an answer',
    { turn: { ended: 'finished', failure: null, answer: 'Three cafes.' } },
    { outcome: 'answered', answer: 'Three cafes.' },
  ],
  [
    'an answer after a soft stop',
    {
      tripped: 'dollars',
      isInterrupted: true,
      turn: { ended: 'finished', failure: null, answer: 'Three cafes.' },
    },
    { outcome: 'answered', answer: 'Three cafes.' },
  ],
  [
    'a tripped limit with no answer',
    { tripped: 'tokens', turn: { ended: 'interrupted', failure: null, answer: '' } },
    { outcome: 'limit', limit: 'tokens' },
  ],
  [
    'the turn limit',
    { turn: { ended: 'limit', failure: null, answer: '' } },
    { outcome: 'limit', limit: 'turns' },
  ],
  [
    'an interrupt',
    { isInterrupted: true, turn: { ended: 'interrupted', failure: null, answer: '' } },
    { outcome: 'interrupted' },
  ],
  [
    'an overflow',
    { turn: { ended: 'overflow', failure: null, answer: '' } },
    { outcome: 'model_failed', detail: "the context passed the model's window" },
  ],
  [
    'a finish with no text',
    { turn: { ended: 'finished', failure: null, answer: '' } },
    { outcome: 'no_answer' },
  ],
])('it picks the end of a run with %s', (_name, facts, expected) => {
  const end = pickWorkerEnd({
    isAborted: false,
    isMinutesUp: false,
    tripped: null,
    isInterrupted: false,
    stage: 'running',
    error: null,
    turn: null,
    ...facts,
  });

  expect(end).toStrictEqual(expected);
});
