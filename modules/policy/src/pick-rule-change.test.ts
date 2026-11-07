import { expect, test } from 'bun:test';
import { pickRuleChange } from './pick-rule-change';
import type { Rule, RuleChange } from './types';

test.each<[string, Rule | null, Rule | null, RuleChange]>([
  [
    'adding a deny',
    null,
    { id: 'deny-purges', outcome: 'deny', tools: ['mail.purge'] },
    'narrowing',
  ],
  ['adding an ask', null, { id: 'ask-deletes', outcome: 'ask', effects: ['delete'] }, 'narrowing'],
  ['adding an allow', null, { id: 'allow-reads', outcome: 'allow', effects: ['read'] }, 'widening'],
  [
    'removing an allow',
    { id: 'allow-reads', outcome: 'allow', effects: ['read'] },
    null,
    'narrowing',
  ],
  ['removing an ask', { id: 'ask-deletes', outcome: 'ask', effects: ['delete'] }, null, 'widening'],
  [
    'removing a deny',
    { id: 'deny-purges', outcome: 'deny', tools: ['mail.purge'] },
    null,
    'widening',
  ],
  [
    'a wider pattern on an allow',
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*@team.example.com'],
    },
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*example.com'],
    },
    'widening',
  ],
  [
    'a narrower pattern on an allow',
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*@example.com'],
    },
    {
      id: 'allow-team-mail',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['pat@example.com'],
    },
    'narrowing',
  ],
  [
    'a wider pattern on an ask',
    { id: 'ask-net-mail', outcome: 'ask', tools: ['mail.send'], destinations: ['pat@example.net'] },
    { id: 'ask-net-mail', outcome: 'ask', tools: ['mail.send'], destinations: ['*.net'] },
    'narrowing',
  ],
  [
    'a narrower pattern on a deny',
    { id: 'deny-net-mail', outcome: 'deny', tools: ['mail.send'], destinations: ['*.net'] },
    {
      id: 'deny-net-mail',
      outcome: 'deny',
      tools: ['mail.send'],
      destinations: ['pat@example.net'],
    },
    'widening',
  ],
  [
    'an effect added to an allow',
    { id: 'allow-reads', outcome: 'allow', effects: ['read'] },
    { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] },
    'widening',
  ],
  [
    'a source added to an allow',
    { id: 'allow-own-memories', outcome: 'allow', tools: ['memory.remember'], sources: ['owner'] },
    {
      id: 'allow-own-memories',
      outcome: 'allow',
      tools: ['memory.remember'],
      sources: ['owner', 'outside'],
    },
    'widening',
  ],
  [
    'a check added to an allow',
    { id: 'allow-starts', outcome: 'allow', tools: ['task.start/nixie'] },
    {
      id: 'allow-starts',
      outcome: 'allow',
      tools: ['task.start/nixie'],
      checks: [{ arg: 'memory', op: 'eq', value: 'none' }],
    },
    'narrowing',
  ],
  [
    'an allow check from a list to one of its values',
    {
      id: 'allow-models',
      outcome: 'allow',
      tools: ['task.start/nixie'],
      checks: [{ arg: 'model', op: 'in', value: ['glm', 'sol'] }],
    },
    {
      id: 'allow-models',
      outcome: 'allow',
      tools: ['task.start/nixie'],
      checks: [{ arg: 'model', op: 'eq', value: 'glm' }],
    },
    'narrowing',
  ],
  [
    'an allow narrowed from a tool to one of its variants',
    { id: 'allow-starts', outcome: 'allow', tools: ['task.start'] },
    { id: 'allow-starts', outcome: 'allow', tools: ['task.start/nixie'] },
    'narrowing',
  ],
  [
    'a stricter outcome over the same match',
    { id: 'mail-rule', outcome: 'ask', tools: ['mail.send'] },
    { id: 'mail-rule', outcome: 'deny', tools: ['mail.send'] },
    'narrowing',
  ],
  [
    'a stricter outcome over a narrower match',
    { id: 'mail-rule', outcome: 'ask', tools: ['mail.*'] },
    { id: 'mail-rule', outcome: 'deny', tools: ['mail.send'] },
    'widening',
  ],
  [
    'an allow turned into an ask over a narrower match',
    { id: 'mail-rule', outcome: 'allow', tools: ['mail.*'] },
    { id: 'mail-rule', outcome: 'ask', tools: ['mail.send'] },
    'narrowing',
  ],
  [
    'a looser outcome over the same match',
    { id: 'mail-rule', outcome: 'deny', tools: ['mail.send'] },
    { id: 'mail-rule', outcome: 'ask', tools: ['mail.send'] },
    'widening',
  ],
  [
    'a sooner expiry',
    {
      id: 'allow-invites',
      outcome: 'allow',
      tools: ['calendar.invite'],
      expires: '2026-11-08T00:00:00.000Z',
    },
    {
      id: 'allow-invites',
      outcome: 'allow',
      tools: ['calendar.invite'],
      expires: '2026-11-07T18:00:00.000Z',
    },
    'narrowing',
  ],
  [
    'an edit to the CEL condition of an ask',
    { id: 'ask-big-sends', outcome: 'ask', tools: ['mail.send'], cel: 'size(args.to) > 20' },
    { id: 'ask-big-sends', outcome: 'ask', tools: ['mail.send'], cel: 'size(args.to) > 10' },
    'widening',
  ],
  [
    'a CEL condition added to a deny',
    { id: 'deny-big-sends', outcome: 'deny', tools: ['mail.send'] },
    { id: 'deny-big-sends', outcome: 'deny', tools: ['mail.send'], cel: 'size(args.to) > 20' },
    'widening',
  ],
  [
    'a note edit',
    { id: 'allow-reads', outcome: 'allow', effects: ['read'], note: 'Reading is harmless.' },
    { id: 'allow-reads', outcome: 'allow', effects: ['read'], note: 'Reading changes nothing.' },
    'unchanged',
  ],
  [
    'the same lists in another order',
    { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] },
    { id: 'allow-reads', outcome: 'allow', effects: ['fetch', 'read'] },
    'unchanged',
  ],
])('it classifies %s', (_label, before, after, change) => {
  expect(pickRuleChange(before, after)).toBe(change);
});
