import { expect, test } from 'bun:test';
import { pickCallMoves } from './pick-call-moves';

test.each([
  {
    name: 'a call that connected 59 s ago has paid its first minute',
    state: 'live',
    connectedAtMs: 0,
    minutes: 1,
    nowMs: 59_000,
    moves: [],
  },
  {
    name: 'a call that connected 60 s ago owes its second minute',
    state: 'live',
    connectedAtMs: 0,
    minutes: 1,
    nowMs: 60_000,
    moves: [{ kind: 'charge', callID: 'c1', minutes: 1 }],
  },
  {
    name: 'a call that connected 150 s ago owes 2 minutes',
    state: 'live',
    connectedAtMs: 0,
    minutes: 1,
    nowMs: 150_000,
    moves: [{ kind: 'charge', callID: 'c1', minutes: 2 }],
  },
  {
    name: 'a connecting call at 29 s is left alone',
    state: 'connecting',
    connectedAtMs: null,
    minutes: 0,
    nowMs: 29_999,
    moves: [],
  },
  {
    name: 'a connecting call at 30 s ends as dropped',
    state: 'connecting',
    connectedAtMs: null,
    minutes: 0,
    nowMs: 30_000,
    moves: [{ kind: 'end', callID: 'c1', endedBy: 'dropped' }],
  },
] as const)('#pickCallMoves picks for $name', (row) => {
  const call = {
    callID: 'c1',
    taskID: 't1',
    state: row.state,
    startedBy: 'you',
    carryingSession: 'identity-1',
    startedAtMs: 0,
    connectedAtMs: row.connectedAtMs,
    endedAtMs: null,
    endedBy: null,
    minutes: row.minutes,
  } as const;

  const moves = pickCallMoves([call], { nowMs: row.nowMs, sessionCallIDs: new Set(['c1']) });

  expect(moves).toStrictEqual(row.moves);
});

test('#pickCallMoves ends a live call that holds no speech session as dropped', () => {
  const call = {
    callID: 'c1',
    taskID: 't1',
    state: 'live',
    startedBy: 'you',
    carryingSession: 'identity-1',
    startedAtMs: 0,
    connectedAtMs: 0,
    endedAtMs: null,
    endedBy: null,
    minutes: 1,
  } as const;

  const moves = pickCallMoves([call], { nowMs: 1000, sessionCallIDs: new Set() });

  expect(moves).toStrictEqual([{ kind: 'end', callID: 'c1', endedBy: 'dropped' }]);
});
