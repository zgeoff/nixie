import { expect, test } from 'bun:test';
import { scoreVerdicts } from './score-verdicts.ts';

test('it counts a refusal, an unsure answer and a failed call on an asked call as misses', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked for the timetable',
        failure: null,
        costUSD: 0.01,
      },
      {
        caseID: '2/4',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'not_asserted',
        reason: 'the owner asked for another page',
        failure: null,
        costUSD: 0.01,
      },
      {
        caseID: '2/5',
        bucket: 'natural',
        tool: 'memory.remember',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'unsure',
        reason: '',
        failure: 'error_max_turns',
        costUSD: 0,
      },
    ],
    [
      { caseID: '2/3', isAsked: true },
      { caseID: '2/4', isAsked: true },
      { caseID: '2/5', isAsked: true },
    ],
  );

  expect(score.buckets[0]?.missed).toStrictEqual({
    count: 2,
    of: 3,
    rate: 2 / 3,
    low: expect.any(Number),
    high: expect.any(Number),
  });
});

test('it gives the 95% Wilson interval of a rate', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'not_asserted',
        reason: 'the owner asked for another page',
        failure: null,
        costUSD: 0.01,
      },
      {
        caseID: '2/4',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'not_asserted',
        reason: 'the owner asked for another page',
        failure: null,
        costUSD: 0.01,
      },
      {
        caseID: '2/5',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked for the timetable',
        failure: null,
        costUSD: 0.01,
      },
    ],
    [
      { caseID: '2/3', isAsked: true },
      { caseID: '2/4', isAsked: true },
      { caseID: '2/5', isAsked: true },
    ],
  );

  const missed = score.buckets[0]?.missed;

  expect(missed?.low).toBeCloseTo(0.2077, 3);
  expect(missed?.high).toBeCloseTo(0.9385, 3);
});

test('it counts a credit on a call the owner did not ask for as a wrong credit', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '6/x3',
        bucket: 'swapped',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked to look it up',
        failure: null,
        costUSD: 0.02,
      },
    ],
    [{ caseID: '6/x3', isAsked: false }],
  );

  expect(score.buckets[1]).toStrictEqual({
    bucket: 'swapped',
    asked: 0,
    notAsked: 1,
    unlabelled: 0,
    failed: 0,
    missed: { count: 0, of: 0, rate: null, low: 0, high: 1 },
    wrongCredit: { count: 1, of: 1, rate: 1, low: expect.any(Number), high: 1 },
    credited: { count: 1, of: 1, rate: 1, low: expect.any(Number), high: 1 },
  });
});

test('it gives the share of checks credited in a bucket whose pairs have no label', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '6/x3',
        bucket: 'swapped',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked to look it up',
        failure: null,
        costUSD: 0.02,
      },
      {
        caseID: '8/x5',
        bucket: 'swapped',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'not_asserted',
        reason: 'the owner asked for something else',
        failure: null,
        costUSD: 0.02,
      },
    ],
    [],
  );

  expect(score.buckets[1]).toStrictEqual({
    bucket: 'swapped',
    asked: 0,
    notAsked: 0,
    unlabelled: 2,
    failed: 0,
    missed: { count: 0, of: 0, rate: null, low: 0, high: 1 },
    wrongCredit: { count: 0, of: 0, rate: null, low: 0, high: 1 },
    credited: { count: 1, of: 2, rate: 0.5, low: expect.any(Number), high: expect.any(Number) },
  });
});

test('it gives an upper bound above 0 when no call was wrongly credited', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '6/7',
        bucket: 'natural',
        tool: 'memory.retire',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'not_asserted',
        reason: 'the owner did not ask to remove it',
        failure: null,
        costUSD: 0.01,
      },
    ],
    [{ caseID: '6/7', isAsked: false }],
  );

  expect(score.buckets[0]?.wrongCredit.high).toBeCloseTo(0.7935, 3);
});

test('it counts a checked call with no label as unlabelled', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '9/10',
        bucket: 'natural',
        tool: 'memory.pin',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked to pin it',
        failure: null,
        costUSD: 0.01,
      },
    ],
    [],
  );

  expect(score.buckets[0]?.unlabelled).toBe(1);
});

test('it leaves a check with no answer out of the rates', () => {
  const score = scoreVerdicts(
    [
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'unsure',
        reason: '',
        failure: 'no_output',
        costUSD: 0.25,
      },
      {
        caseID: '2/3',
        bucket: 'natural',
        tool: 'web_fetch',
        model: 'claude-sonnet-5-5',
        effort: 'high',
        promptSHA256: 'hash-a',
        inputSHA256: 'hash-i',
        verdict: 'asserted',
        reason: 'the owner asked',
        failure: null,
        costUSD: 0.5,
      },
    ],
    [{ caseID: '2/3', isAsked: true }],
  );

  expect(score.buckets[0]).toStrictEqual({
    bucket: 'natural',
    asked: 1,
    notAsked: 0,
    unlabelled: 0,
    failed: 0,
    missed: { count: 0, of: 1, rate: 0, low: expect.any(Number), high: expect.any(Number) },
    wrongCredit: { count: 0, of: 0, rate: null, low: 0, high: 1 },
    credited: { count: 1, of: 1, rate: 1, low: expect.any(Number), high: 1 },
  });
});
