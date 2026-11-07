import { expect, test } from 'bun:test';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { parseRuleFiles } from './parse-rule-files';
import { renderRule } from './render-rule';
import type { Rule } from './types';

test.each<[string, Rule, string]>([
  [
    'allow-mail-to-team',
    {
      id: 'allow-mail-to-team',
      outcome: 'allow',
      tools: ['mail.send'],
      destinations: ['*@example.com'],
    },
    '**Allow** `mail.send` when every destination matches `*@example.com`.',
  ],
  [
    'ask-mail-attachments',
    {
      id: 'ask-mail-attachments',
      outcome: 'ask',
      tools: ['mail.send'],
      checks: [{ arg: 'attachments', op: 'matches', value: '*' }],
    },
    '**Ask** before `mail.send` when `attachments` matches `*`.',
  ],
  [
    'ask-coding-sessions',
    { id: 'ask-coding-sessions', outcome: 'ask', tools: ['task.start/atc'] },
    '**Ask** before starting a task in atc.',
  ],
  [
    'allow-any-task-start',
    { id: 'allow-any-task-start', outcome: 'allow', tools: ['task.start/*'] },
    '**Allow** `task.start/*`.',
  ],
  [
    'deny-net-mail',
    {
      id: 'deny-net-mail',
      outcome: 'deny',
      tools: ['mail.send', 'mail.reply'],
      destinations: ['*.net', '*.org'],
    },
    '**Deny** `mail.send` or `mail.reply` when a destination matches `*.net` or `*.org`.',
  ],
  [
    'allow-reads',
    { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch', 'note'] },
    '**Allow** a call when every effect it has is `read`, `fetch` or `note`.',
  ],
  [
    'ask-deletes',
    { id: 'ask-deletes', outcome: 'ask', effects: ['delete'] },
    '**Ask** before a call when it has the effect `delete`.',
  ],
  [
    'ask-memory-off-claude',
    {
      id: 'ask-memory-off-claude',
      outcome: 'ask',
      tools: ['task.start/nixie'],
      checks: [
        { arg: 'memory', op: 'eq', value: 'read' },
        { arg: 'model', op: 'in', value: ['glm', 'sol'] },
      ],
    },
    '**Ask** before starting a task in nixie when `memory` is `read` and `model` is `glm` or `sol`.',
  ],
  [
    'ask-job-sends',
    {
      id: 'ask-job-sends',
      outcome: 'ask',
      effects: ['send'],
      contexts: ['job', 'task'],
      jobs: ['inbox-triage'],
    },
    '**Ask** before a call when it has the effect `send`, it runs in a job or a task and it runs in the job `inbox-triage`.',
  ],
  [
    'allow-own-memories',
    {
      id: 'allow-own-memories',
      outcome: 'allow',
      tools: ['memory.remember'],
      sources: ['owner', 'own_data'],
    },
    '**Allow** `memory.remember` when its content comes only from you or your own data.',
  ],
  [
    'ask-outside-memories',
    {
      id: 'ask-outside-memories',
      outcome: 'ask',
      tools: ['memory.remember'],
      sources: ['outside'],
    },
    '**Ask** before `memory.remember` when any of its content comes from outside.',
  ],
  [
    'allow-invites-today',
    {
      id: 'allow-invites-today',
      outcome: 'allow',
      tools: ['calendar.invite'],
      expires: '2026-11-07T23:59:00.000Z',
    },
    '**Allow** `calendar.invite`, until 2026-11-07T23:59:00.000Z.',
  ],
  [
    'deny-big-sends',
    { id: 'deny-big-sends', outcome: 'deny', tools: ['mail.send'], cel: 'size(args.to) > 20' },
    '**Deny** `mail.send`, whatever the CEL condition `size(args.to) > 20`.',
  ],
  [
    'allow-small-sends',
    { id: 'allow-small-sends', outcome: 'allow', tools: ['mail.send'], cel: 'size(args.to) < 3' },
    '**Allow** no call, because nixie never evaluates the CEL condition `size(args.to) < 3`.',
  ],
])('it renders %s as one sentence', (_id, rule, sentence) => {
  expect(renderRule(rule)).toBe(sentence);
});

test('it renders every rule of the starter template as one sentence', async () => {
  const text = await Bun.file(
    join(import.meta.dir, '../../../deploy/compose/definitions/rules/starter.yaml'),
  ).text();

  const parsed = parseRuleFiles(new Map([['rules/starter.yaml', text]]));

  invariant(parsed.status === 'parsed');

  expect(parsed.rules.map((entry) => [entry.rule.id, renderRule(entry.rule)])).toStrictEqual([
    [
      'allow-narrowing',
      '**Allow** a call when every effect it has is `budget_lower` or `policy_narrow`.',
    ],
    ['allow-notes', '**Allow** a call when every effect it has is `note`.'],
    ['allow-reads', '**Allow** a call when every effect it has is `fetch` or `read`.'],
    ['allow-sandboxed-code', '**Allow** a call when every effect it has is `code_run`.'],
    ['allow-sends-within-limits', '**Allow** a call when every effect it has is `send`.'],
    ['allow-service-writes', '**Allow** a call when every effect it has is `write`.'],
    ['ask-exports', '**Ask** before a call when it has the effect `export`.'],
    ['ask-permanent-deletes', '**Ask** before a call when it has the effect `delete`.'],
    [
      'ask-stranger-with-memory',
      '**Ask** before starting a task in nixie when `memory` is `read` and `persona` is `none`.',
    ],
  ]);
});
