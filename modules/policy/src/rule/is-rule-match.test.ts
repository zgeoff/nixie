import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { Rule, RuleCall } from '../types';
import { toolShapes } from '../utils/tool-shapes';
import { isRuleMatch } from './is-rule-match';
import { parseRuleFiles } from './parse-rule-files';

test.each<[string, Rule, Partial<RuleCall>, boolean]>([
  [
    'a deny that lists memory_write matches a call that declares memory_write',
    { id: 'deny-memory', outcome: 'deny', effects: ['memory_write'] },
    { effects: ['memory_write'] },
    true,
  ],
  [
    'an ask that lists memory_write matches a call that declares memory_write',
    { id: 'ask-memory', outcome: 'ask', effects: ['memory_write'] },
    { effects: ['memory_write'] },
    true,
  ],
  [
    'an allow that lists memory_write matches a call that declares memory_write',
    { id: 'allow-memory', outcome: 'allow', effects: ['memory_write'] },
    { effects: ['memory_write'] },
    true,
  ],
  [
    'a deny that lists memory_write leaves a call that declares note',
    { id: 'deny-memory', outcome: 'deny', effects: ['memory_write'] },
    { effects: ['note'] },
    false,
  ],
  [
    'an ask that lists memory_write leaves a call that declares note',
    { id: 'ask-memory', outcome: 'ask', effects: ['memory_write'] },
    { effects: ['read', 'note'] },
    false,
  ],
  [
    'an allow that lists memory_write leaves a call that declares note',
    { id: 'allow-memory', outcome: 'allow', effects: ['memory_write'] },
    { effects: ['note'] },
    false,
  ],
  [
    'an allow covers a send whose every destination matches',
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*@example.com'],
    },
    { destinations: ['pat@example.com', 'lee@example.com'] },
    true,
  ],
  [
    'an allow leaves a send with one destination outside its patterns',
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*@example.com'],
    },
    { destinations: ['pat@example.com', 'stranger@example.net'] },
    false,
  ],
  [
    'an allow leaves a call with no destination',
    { id: 'allow-team-mail', outcome: 'allow', destinations: ['*@example.com'] },
    { tool: 'files.remove', destinations: [] },
    false,
  ],
  [
    'an ask catches a send with one destination inside its patterns',
    { id: 'ask-net-mail', outcome: 'ask', tools: ['mail.send'], destinations: ['*.net'] },
    { destinations: ['pat@example.com', 'stranger@example.net'] },
    true,
  ],
  [
    'an allow covers a call whose every effect it lists',
    { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] },
    { tool: 'web.fetch', effects: ['fetch'] },
    true,
  ],
  [
    'an allow leaves a call with an effect it does not list',
    { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] },
    { tool: 'mail.forward', effects: ['read', 'send'] },
    false,
  ],
  [
    'an allow leaves a call with no effect',
    { id: 'allow-reads', outcome: 'allow', effects: ['read'] },
    { tool: 'clock.tick', effects: [] },
    false,
  ],
  [
    'a deny catches a call that shares one effect',
    { id: 'deny-deletes', outcome: 'deny', effects: ['delete'] },
    { tool: 'files.tidy', effects: ['write', 'delete'] },
    true,
  ],
  [
    'an allow covers a list argument when every element passes',
    {
      id: 'allow-small-files',
      outcome: 'allow',
      tools: ['mail.send'],
      checks: [{ arg: 'attachments', op: 'matches', value: '*.txt' }],
    },
    { args: { attachments: ['notes.txt', 'list.txt'] } },
    true,
  ],
  [
    'an allow leaves a list argument with one element that fails',
    {
      id: 'allow-small-files',
      outcome: 'allow',
      tools: ['mail.send'],
      checks: [{ arg: 'attachments', op: 'matches', value: '*.txt' }],
    },
    { args: { attachments: ['notes.txt', 'run.exe'] } },
    false,
  ],
  [
    'an ask catches a list argument with one element that passes',
    {
      id: 'ask-mail-attachments',
      outcome: 'ask',
      tools: ['mail.send'],
      checks: [{ arg: 'attachments', op: 'matches', value: '*' }],
    },
    { args: { attachments: ['plan.pdf'] } },
    true,
  ],
  [
    'an ask leaves a call without the argument it checks',
    {
      id: 'ask-mail-attachments',
      outcome: 'ask',
      tools: ['mail.send'],
      checks: [{ arg: 'attachments', op: 'matches', value: '*' }],
    },
    { args: {} },
    false,
  ],
  [
    'a check reads a nested argument by its path',
    {
      id: 'ask-work-address',
      outcome: 'ask',
      tools: ['mail.send'],
      checks: [{ arg: 'from.address', op: 'eq', value: 'work@example.com' }],
    },
    { args: { from: { address: 'work@example.com' } } },
    true,
  ],
  [
    'a tool name matches each variant of the tool',
    { id: 'ask-starts', outcome: 'ask', tools: ['task.start'] },
    { tool: 'task.start/atc', effects: ['code_run'] },
    true,
  ],
  [
    'a variant leaves another variant of the tool',
    { id: 'ask-coding-sessions', outcome: 'ask', tools: ['task.start/atc'] },
    { tool: 'task.start/sandbox', effects: ['note'] },
    false,
  ],
  [
    'a rule for some contexts leaves a call in another',
    { id: 'ask-sends-in-tasks', outcome: 'ask', effects: ['send'], contexts: ['task'] },
    { context: 'conversation' },
    false,
  ],
  [
    'a rule for the task context catches a task run of a definition',
    { id: 'ask-sends-in-tasks', outcome: 'ask', effects: ['send'], contexts: ['task'] },
    { context: 'task', task: 'inbox-triage' },
    true,
  ],
  [
    'an allow on sources covers a write with only those sources',
    { id: 'allow-own-memories', outcome: 'allow', tools: ['memory.remember'], sources: ['owner'] },
    { tool: 'memory.remember', effects: ['note'], sources: ['owner'] },
    true,
  ],
  [
    'an allow on sources leaves a write that also holds outside content',
    { id: 'allow-own-memories', outcome: 'allow', tools: ['memory.remember'], sources: ['owner'] },
    { tool: 'memory.remember', effects: ['note'], sources: ['owner', 'outside'] },
    false,
  ],
  [
    'an ask on sources catches a write that holds one of them',
    {
      id: 'ask-outside-memories',
      outcome: 'ask',
      tools: ['memory.remember'],
      sources: ['outside'],
    },
    { tool: 'memory.remember', effects: ['note'], sources: ['owner', 'outside'] },
    true,
  ],
  [
    'a rule matches no call at or after its expiry',
    {
      id: 'allow-invites-today',
      outcome: 'allow',
      tools: ['mail.send'],
      expires: '2026-11-07T23:59:00.000Z',
    },
    { at: Date.parse('2026-11-07T23:59:00.000Z') },
    false,
  ],
  [
    'a rule matches a call before its expiry',
    {
      id: 'allow-invites-today',
      outcome: 'allow',
      tools: ['mail.send'],
      expires: '2026-11-07T23:59:00.000Z',
    },
    { at: Date.parse('2026-11-07T23:58:59.000Z') },
    true,
  ],
  [
    'an allow whose condition is true covers the call',
    {
      id: 'allow-small-sends',
      outcome: 'allow',
      tools: ['mail.send'],
      cel: 'args.count < 3',
      note: 'Small sends.',
    },
    { args: { count: 2 } },
    true,
  ],
  [
    'an allow whose condition is false does not cover the call',
    {
      id: 'allow-small-sends',
      outcome: 'allow',
      tools: ['mail.send'],
      cel: 'args.count < 3',
      note: 'Small sends.',
    },
    { args: { count: 5 } },
    false,
  ],
  [
    'an allow whose condition errors does not cover the call',
    {
      id: 'allow-small-sends',
      outcome: 'allow',
      tools: ['mail.send'],
      cel: 'args.count < 3',
      note: 'Small sends.',
    },
    {},
    false,
  ],
  [
    'an allow with a condition and no note does not cover the call',
    { id: 'allow-small-sends', outcome: 'allow', tools: ['mail.send'], cel: 'args.count < 3' },
    { args: { count: 2 } },
    false,
  ],
  [
    'an ask whose condition is true catches the call',
    {
      id: 'ask-big-sends',
      outcome: 'ask',
      tools: ['mail.send'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    { args: { count: 5 } },
    true,
  ],
  [
    'an ask whose condition is false does not catch the call',
    {
      id: 'ask-big-sends',
      outcome: 'ask',
      tools: ['mail.send'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    { args: { count: 2 } },
    false,
  ],
  [
    'an ask whose condition errors catches the call',
    {
      id: 'ask-big-sends',
      outcome: 'ask',
      tools: ['mail.send'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    {},
    true,
  ],
  [
    'a deny whose condition is true catches the call',
    {
      id: 'deny-big-sends',
      outcome: 'deny',
      tools: ['mail.send'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    { args: { count: 5 } },
    true,
  ],
  [
    'a deny whose condition errors does not catch the call',
    {
      id: 'deny-big-sends',
      outcome: 'deny',
      tools: ['mail.send'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    {},
    false,
  ],
  [
    'an ask whose tool differs is not asked about its condition',
    {
      id: 'ask-big-sends',
      outcome: 'ask',
      tools: ['files.remove'],
      cel: 'args.count > 3',
      note: 'Big sends.',
    },
    {},
    false,
  ],
])('it matches when %s: %p', (_label, rule, call, isMatch) => {
  expect(
    isRuleMatch(rule, {
      tool: 'mail.send',
      effects: ['send'],
      context: 'conversation',
      task: null,
      args: {},
      destinations: [],
      sources: [],
      contentArgs: [],
      at: 0,
      ...call,
    }),
  ).toBe(isMatch);
});

test.each([
  ['a start that reads memory on a listed model', { memory: 'read', model: 'glm' }, true],
  ['a start with memory off', { memory: 'none', model: 'glm' }, false],
  ['a start on a model outside the list', { memory: 'read', model: 'opus' }, false],
])(
  'it matches the memory and model checks of task.start/sandbox to %s: %p',
  (_label, args, isMatch) => {
    const rule: Rule = {
      id: 'ask-memory-off-claude',
      outcome: 'ask',
      tools: ['task.start/sandbox'],
      checks: [
        { arg: 'memory', op: 'eq', value: 'read' },
        { arg: 'model', op: 'in', value: ['glm', 'sol'] },
      ],
    };

    expect(
      isRuleMatch(rule, {
        tool: 'task.start/sandbox',
        effects: ['note'],
        context: 'conversation',
        task: null,
        args: { name: 'Garden plan', brief: 'Plan the beds.', ...args },
        destinations: [],
        sources: [],
        contentArgs: [],
        at: 0,
      }),
    ).toBe(isMatch);
  },
);

test.each([
  [
    'definitions and task',
    'ask-triage-sends:\n  outcome: ask\n  contexts: [task]\n  definitions: [inbox-triage]\n',
  ],
  [
    'the old names jobs and job',
    'ask-triage-sends:\n  outcome: ask\n  contexts: [job]\n  jobs: [inbox-triage]\n',
  ],
])('it matches only a task run of the listed definition for a rule with %s', (_label, text) => {
  const parsed = parseRuleFiles(new Map([['rules/mail.yaml', text]]));
  const rule = parsed.status === 'parsed' ? parsed.rules[0]?.rule : undefined;

  invariant(rule !== undefined, 'the rule file parses');

  const call: RuleCall = {
    tool: 'mail.send',
    effects: ['send'],
    context: 'task',
    task: null,
    args: {},
    destinations: [],
    sources: [],
    contentArgs: [],
    at: 0,
  };

  expect([
    isRuleMatch(rule, { ...call, task: 'inbox-triage' }),
    isRuleMatch(rule, { ...call, task: 'evening' }),
    isRuleMatch(rule, call),
  ]).toStrictEqual([true, false, false]);
});

test.each([
  ['the old context job', 'ask-task-sends:\n  outcome: ask\n  contexts: [job]\n'],
  ['the context task', 'ask-task-sends:\n  outcome: ask\n  contexts: [task]\n'],
])('it matches a chat task and a definition task run for a rule with %s', (_label, text) => {
  const parsed = parseRuleFiles(new Map([['rules/mail.yaml', text]]));
  const rule = parsed.status === 'parsed' ? parsed.rules[0]?.rule : undefined;

  invariant(rule !== undefined, 'the rule file parses');

  const call: RuleCall = {
    tool: 'mail.send',
    effects: ['send'],
    context: 'task',
    task: null,
    args: {},
    destinations: [],
    sources: [],
    contentArgs: [],
    at: 0,
  };

  expect([
    isRuleMatch(rule, call),
    isRuleMatch(rule, { ...call, task: 'inbox-triage' }),
    isRuleMatch(rule, { ...call, context: 'conversation' }),
  ]).toStrictEqual([true, true, false]);
});

test.each([
  { title: 'reads the argument of a command tool as a command line', shapes: true, isMatch: false },
  {
    title: 'reads the same argument as plain text when no shape names its tool',
    shapes: false,
    isMatch: true,
  },
])('it $title', (row) => {
  const shapes = row.shapes
    ? [{ kind: 'command' as const, tool: 'ops.run', argument: 'line' }]
    : [];

  toolShapes.set(shapes);

  const isMatch = isRuleMatch(
    {
      id: 'ops-git-status',
      outcome: 'allow',
      tools: ['ops.run'],
      checks: [{ arg: 'line', op: 'matches', value: 'git status *' }],
    },
    {
      tool: 'ops.run',
      effects: ['send'],
      context: 'conversation',
      task: null,
      args: { line: 'git status && rm notes.txt' },
      destinations: [],
      sources: [],
      at: 0,
    },
  );

  expect(isMatch).toBe(row.isMatch);
});
