import { expect, test } from 'bun:test';
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
    '**Ask** before `task.start/atc`.',
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
    '**Ask** before `task.start/nixie` when `memory` is `read` and `model` is `glm` or `sol`.',
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
    '**Deny** `mail.send` when the CEL condition `size(args.to) > 20` holds.',
  ],
])('it renders %s as one sentence', (_id, rule, sentence) => {
  expect(renderRule(rule)).toBe(sentence);
});
