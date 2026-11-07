import { expect, test } from 'bun:test';
import { isRuleMatch } from './is-rule-match';
import type { Rule, RuleCall } from './types';

test.each<[string, Rule, Partial<RuleCall>, boolean]>([
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
    { tool: 'task.start/nixie', effects: ['note'] },
    false,
  ],
  [
    'a rule for some contexts leaves a call in another',
    { id: 'ask-sends-in-jobs', outcome: 'ask', effects: ['send'], contexts: ['job'] },
    { context: 'conversation' },
    false,
  ],
  [
    'a rule for some jobs catches a call in one of them',
    { id: 'ask-triage-sends', outcome: 'ask', effects: ['send'], jobs: ['inbox-triage'] },
    { context: 'job', job: 'inbox-triage' },
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
    'an allow with a CEL condition covers no call',
    { id: 'allow-small-sends', outcome: 'allow', tools: ['mail.send'], cel: 'size(args.to) < 3' },
    {},
    false,
  ],
  [
    'a deny with a CEL condition catches on its other fields',
    { id: 'deny-big-sends', outcome: 'deny', tools: ['mail.send'], cel: 'size(args.to) > 20' },
    {},
    true,
  ],
])('it matches when %s: %p', (_label, rule, call, isMatch) => {
  expect(
    isRuleMatch(rule, {
      tool: 'mail.send',
      effects: ['send'],
      context: 'conversation',
      job: null,
      args: {},
      destinations: [],
      sources: [],
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
  'it matches the memory and model checks of task.start/nixie to %s: %p',
  (_label, args, isMatch) => {
    const rule: Rule = {
      id: 'ask-memory-off-claude',
      outcome: 'ask',
      tools: ['task.start/nixie'],
      checks: [
        { arg: 'memory', op: 'eq', value: 'read' },
        { arg: 'model', op: 'in', value: ['glm', 'sol'] },
      ],
    };

    expect(
      isRuleMatch(rule, {
        tool: 'task.start/nixie',
        effects: ['note'],
        context: 'conversation',
        job: null,
        args: { name: 'Garden plan', brief: 'Plan the beds.', ...args },
        destinations: [],
        sources: [],
        at: 0,
      }),
    ).toBe(isMatch);
  },
);
