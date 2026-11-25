import { expect, test } from 'bun:test';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import { gmailDeclarations } from './gmail-declarations';

test.each([
  {
    tool: 'gmail.search',
    effects: ['read'],
    results: { messages: 'untrusted', next: 'owner_data' },
  },
  {
    tool: 'gmail.read',
    effects: ['read'],
    results: {
      from: 'untrusted',
      replyTo: 'untrusted',
      to: 'untrusted',
      cc: 'untrusted',
      subject: 'untrusted',
      text: 'untrusted',
      attachments: 'untrusted',
      message: 'owner_data',
      thread: 'owner_data',
      labels: 'owner_data',
    },
  },
  {
    tool: 'gmail.read_attachment',
    effects: ['read'],
    results: { name: 'untrusted', type: 'untrusted', text: 'untrusted', part: 'owner_data' },
  },
  {
    tool: 'gmail.label',
    effects: ['write'],
    results: { threads: 'owner_data', created: 'owner_data' },
  },
  { tool: 'gmail.draft', effects: ['write'], results: { draft: 'owner_data' } },
  {
    tool: 'gmail.send',
    effects: ['send'],
    results: { message: 'owner_data', thread: 'owner_data' },
  },
  {
    tool: 'gmail.reply',
    effects: ['send'],
    results: { message: 'owner_data', thread: 'owner_data' },
  },
  {
    tool: 'gmail.send_draft',
    effects: ['send'],
    results: { message: 'owner_data', thread: 'owner_data' },
  },
])('it declares the effects and result sources of $tool', async (row) => {
  const ctx = await startGmailTools();

  const declaration = ctx.findAction(row.tool).tool.declaration;

  expect({ effects: declaration.effects, results: declaration.results }).toMatchObject({
    effects: row.effects,
    results: row.results,
  });
});

test('it makes every field that holds a mail word untrusted, and none of them owner data', () => {
  const holding = new Set([
    'from',
    'replyTo',
    'to',
    'cc',
    'subject',
    'snippet',
    'text',
    'attachments',
    'name',
    'type',
  ]);

  const sources = Object.values(gmailDeclarations).flatMap((declaration) =>
    Object.entries(declaration.results)
      .filter(([name]) => holding.has(name))
      .map(([, source]) => source),
  );

  expect(sources).toSatisfyAll((source) => source === 'untrusted');
});

test('it needs the one scope gmail.modify for every Gmail tool', async () => {
  const ctx = await startGmailTools();

  expect(ctx.actions.map((action) => action.scopes)).toSatisfyAll(
    (scopes) => scopes.length === 1 && scopes[0] === 'gmail.modify',
  );
});

test.each([
  { tool: 'gmail.search', execution: 'direct' },
  { tool: 'gmail.read', execution: 'direct' },
  { tool: 'gmail.read_attachment', execution: 'direct' },
  { tool: 'gmail.label', execution: 'queued' },
  { tool: 'gmail.draft', execution: 'queued' },
  { tool: 'gmail.send', execution: 'queued' },
  { tool: 'gmail.reply', execution: 'queued' },
  { tool: 'gmail.send_draft', execution: 'queued' },
])('it runs $tool as $execution', async (row) => {
  const ctx = await startGmailTools();

  expect(ctx.findAction(row.tool).tool.execution).toBe(row.execution);
});
