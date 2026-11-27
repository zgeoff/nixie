import { expect, test } from 'bun:test';
import { buildConditionNotice } from './build-condition-notice';

test('it says nothing when no condition errored', () => {
  expect(buildConditionNotice([])).toBeNull();
});

test('it names the rule and the error code of a condition that errored', () => {
  expect(
    buildConditionNotice([
      { ruleID: 'deny-big-sends', outcome: 'deny', revision: 2, code: 'no_such_overload' },
    ]),
  ).toBe('The condition of the rule `deny-big-sends` failed with the error no_such_overload.');
});

test('it names the missing argument of an allow rule that a missing key stopped', () => {
  expect(
    buildConditionNotice([
      {
        ruleID: 'allow-term-mail',
        outcome: 'allow',
        revision: 1,
        code: 'no_such_key',
        missing: 'subject',
      },
    ]),
  ).toBe(
    'The rule `allow-term-mail` would allow this call, but its condition failed with the error no_such_key: the call left out the argument `subject`. Call again with it.',
  );
});

test('it names a missing key that needs quotes in a condition', () => {
  expect(
    buildConditionNotice([
      {
        ruleID: 'allow-term-mail',
        outcome: 'allow',
        revision: 1,
        code: 'no_such_key',
        missing: 'cc address',
      },
    ]),
  ).toBe(
    'The rule `allow-term-mail` would allow this call, but its condition failed with the error no_such_key: the call left out the argument `cc address`. Call again with it.',
  );
});

test('it fences a missing key that holds a backtick with a longer run of backticks', () => {
  expect(
    buildConditionNotice([
      {
        ruleID: 'allow-term-mail',
        outcome: 'allow',
        revision: 1,
        code: 'no_such_key',
        missing: 'cc`address',
      },
    ]),
  ).toBe(
    'The rule `allow-term-mail` would allow this call, but its condition failed with the error no_such_key: the call left out the argument `` cc`address ``. Call again with it.',
  );
});

test('it names a missing key of an ask rule by its code alone', () => {
  expect(
    buildConditionNotice([
      { ruleID: 'ask-big', outcome: 'ask', revision: 1, code: 'no_such_key', missing: 'count' },
    ]),
  ).toBe('The condition of the rule `ask-big` failed with the error no_such_key.');
});
