import { expect, test } from 'bun:test';
import { readScenarioRunner } from './read-scenario-runner';

// The scripted scenarios of the policy rules spike, run through the real decision point against the
// starter rules. A step that relied on a lift, an "always allow" answer or a proposed rule keeps the
// outcome this build gives, because none of those exists yet.

test('it allows finding something on the web', async () => {
  const ctx = readScenarioRunner();
  const talk = { context: 'conversation', typed: 'when does the botanic garden open?' } as const;

  const lines = await ctx.runAll([
    { tool: 'search.web', ...talk },
    { tool: 'web.fetch', ...talk },
    { tool: 'notes.write', ...talk },
  ]);

  expect(lines).toStrictEqual([
    'search.web: allow at stage 7',
    'web.fetch: allow at stage 7',
    'notes.write: allow at stage 7',
  ]);
});

test('it allows sending to an address the owner typed', async () => {
  const ctx = readScenarioRunner();
  const typed = 'find friday trains to leeds and send them to sam@example.com';

  const lines = await ctx.runAll([
    { tool: 'search.web', context: 'conversation', typed },
    { tool: 'mail.send', args: { to: ['sam@example.com'] }, context: 'conversation', typed },
  ]);

  expect(lines).toStrictEqual(['search.web: allow at stage 7', 'mail.send: allow at stage 7']);
});

test('it allows sending to a saved contact by name', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    {
      tool: 'mail.send',
      args: { to: ['sam@example.com'] },
      context: 'conversation',
      typed: 'send those train times to Sam',
    },
  ]);

  expect(lines).toStrictEqual(['mail.send: allow at stage 7']);
});

test('it triages an inbox as a job run and asks only for the injected forward', async () => {
  const ctx = readScenarioRunner();

  const triage = {
    context: 'job',
    job: 'inbox-triage',
    sources: ['own_data', 'outside'],
    replyTarget: 'sender@example.org',
    toolList: [
      'mail.search',
      'mail.read',
      'mail.label',
      'mail.archive',
      'mail.trash',
      'mail.draft',
      'mail.reply',
      'mail.send',
      'notify.owner',
    ],
  } as const;

  const lines = await ctx.runAll([
    { tool: 'mail.search', ...triage },
    { tool: 'mail.read', ...triage },
    { tool: 'mail.label', ...triage },
    { tool: 'mail.archive', ...triage },
    { tool: 'mail.trash', ...triage },
    { tool: 'mail.draft', ...triage },
    { tool: 'mail.reply', args: { to: ['sender@example.org'] }, ...triage },
    { tool: 'mail.send', args: { to: ['partner@example.com'] }, ...triage },
    { tool: 'mail.send', args: { to: ['attacker@evil.example'] }, ...triage },
    { tool: 'calendar.invite', args: { attendees: ['x@example.net'] }, ...triage },
    { tool: 'notify.owner', args: { to: 'owner' }, ...triage },
  ]);

  expect(lines).toStrictEqual([
    'mail.search: allow at stage 7',
    'mail.read: allow at stage 7',
    'mail.label: allow at stage 7',
    'mail.archive: allow at stage 7',
    'mail.trash: allow at stage 7',
    'mail.draft: allow at stage 7',
    'mail.reply: allow at stage 7',
    'mail.send: allow at stage 7',
    'mail.send: ask at stage 5 (outside_steering)',
    'calendar.invite: deny at stage 2',
    'notify.owner: allow at stage 7',
  ]);
});

test('it asks before a booking whose venue came from search results', async () => {
  const ctx = readScenarioRunner();
  const typed = 'book a table for 2 at the copper pot on friday at 7';

  const lines = await ctx.runAll([
    { tool: 'search.web', context: 'conversation', typed },
    {
      tool: 'booking.reserve',
      args: { venue: 'venue:copper-pot-riverside' },
      context: 'conversation',
      typed,
      sources: ['owner', 'outside'],
    },
  ]);

  expect(lines).toStrictEqual([
    'search.web: allow at stage 7',
    'booking.reserve: ask at stage 5 (outside_steering)',
  ]);
});

test('it asks about every purchase, because no lift lets a small one pass yet', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll(
    [12, 30, 18, 19].map((amount) => ({
      tool: 'shop.buy',
      args: { merchant: 'shop.example', amount },
      context: 'conversation' as const,
      typed: `buy it for ${String(amount)} from shop.example`,
    })),
  );

  expect(lines).toStrictEqual(
    Array.from({ length: 4 }, () => 'shop.buy: ask at stage 4 (always_ask)'),
  );
});

test('it asks about a tool no rule covers on every call, because "always allow" does not exist yet', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    { tool: 'home.lights', args: { room: 'study' }, context: 'task' },
    { tool: 'home.lights', args: { room: 'study' }, context: 'task' },
    { tool: 'home.lights', args: { room: 'study' }, context: 'job', job: 'evening' },
  ]);

  expect(lines).toStrictEqual(
    Array.from({ length: 3 }, () => 'home.lights: ask at stage 9 (no_rule)'),
  );
});

test('it keeps asking about a tool no rule covers until a rule exists, and always asks to widen the rules', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    { tool: 'home.lights', args: { room: 'hall' }, context: 'task' },
    { tool: 'rules.add', context: 'task' },
    { tool: 'home.lights', args: { room: 'hall' }, context: 'task' },
  ]);

  expect(lines).toStrictEqual([
    'home.lights: ask at stage 9 (no_rule)',
    'rules.add: ask at stage 4 (always_ask)',
    'home.lights: ask at stage 9 (no_rule)',
  ]);
});

test('it allows a tool no rule covers when the owner asked for it in typed words', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    {
      tool: 'home.lights',
      args: { room: 'hall' },
      context: 'conversation',
      typed: 'turn the hall lights on',
    },
  ]);

  expect(lines).toStrictEqual(['home.lights: allow at stage 8']);
});

test('it allows a morning report job its reads and its note to the owner', async () => {
  const ctx = readScenarioRunner();
  const job = { context: 'job', job: 'morning-report' } as const;

  const lines = await ctx.runAll([
    { tool: 'calendar.list', ...job },
    { tool: 'mail.search', ...job },
    { tool: 'web.fetch', ...job },
    { tool: 'notify.owner', args: { to: 'owner' }, ...job },
  ]);

  expect(lines).toStrictEqual([
    'calendar.list: allow at stage 7',
    'mail.search: allow at stage 7',
    'web.fetch: allow at stage 7',
    'notify.owner: allow at stage 7',
  ]);
});

test('it asks to widen the rules for a grant, and asks about each invite while no grant exists', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    {
      tool: 'rules.add',
      context: 'conversation',
      typed: 'you have full authority over my calendar invites today',
    },
    {
      tool: 'calendar.invite',
      args: { attendees: ['new1@example.net'] },
      context: 'task',
      sources: ['task', 'outside'],
    },
  ]);

  expect(lines).toStrictEqual([
    'rules.add: ask at stage 4 (always_ask)',
    'calendar.invite: ask at stage 5 (outside_steering)',
  ]);
});

test('it lets the owner create a job by asking for it', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    {
      tool: 'job.create',
      args: { tools: ['mail.search', 'mail.reply'] },
      context: 'conversation',
      typed: 'every weekday, reply to routine emails for me',
    },
    {
      tool: 'job.create',
      args: { tools: ['calendar.list', 'notify.owner'] },
      context: 'conversation',
      typed: 'every morning, tell me what is on today',
    },
  ]);

  expect(lines).toStrictEqual(['job.create: allow at stage 8', 'job.create: allow at stage 8']);
});

test('it asks about a job that nobody asked for', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    { tool: 'job.create', args: { tools: ['web.fetch', 'notes.write'] }, context: 'task' },
  ]);

  expect(lines).toStrictEqual(['job.create: ask at stage 9 (no_rule)']);
});

test('it asks before deleting for good, even when the owner asked', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    { tool: 'mail.purge', context: 'conversation', typed: 'empty the trash' },
  ]);

  expect(lines).toStrictEqual(['mail.purge: ask at stage 6 (ask_rule)']);
});

test('it reports each call as a line with its outcome, stage and cause', async () => {
  const ctx = readScenarioRunner();

  const lines = await ctx.runAll([
    { tool: 'web.fetch', context: 'task' },
    { tool: 'shop.buy', args: { merchant: 'shop.example' }, context: 'task' },
    { tool: 'unknown.tool', context: 'task' },
  ]);

  expect(lines).toStrictEqual([
    'web.fetch: allow at stage 7',
    'shop.buy: ask at stage 4 (always_ask)',
    'unknown.tool: deny at stage 1',
  ]);
});
