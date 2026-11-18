import { expect, test } from 'bun:test';
import { githubAPIURL } from '@heynixie/definitions-repo-github/mocks';
import { kagiAPIURL, kagiStore } from '@heynixie/search-kagi/mocks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from '../test-utils/create-test-client';
import { readHostLedger } from '../test-utils/read-host-ledger';
import { runHostCommand } from '../test-utils/run-host-command';
import { seedPaidBudgetSpend } from '../test-utils/seed-paid-budget-spend';
import { sendClientMessage } from '../test-utils/send-client-message';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return nixie;
}

test('it serves prompt_read to the conversation, which returns the built-in compaction prompt', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'prompt_read', input: { id: 'compaction' } } },
    { text: 'Read it.' },
  );

  await sendClientMessage(api.client, { text: 'Show me the compaction prompt.' }, 'Read it.');

  const read = ctx.toolResults.at(-1);

  invariant(read);

  const answer: unknown = JSON.parse(read.result);

  expect(read.name).toBe('prompt_read');

  expect(answer).toMatchObject({
    structuredContent: {
      id: 'compaction',
      parts: [
        { name: 'instruction', override: null },
        { name: 'safety', override: null },
      ],
      template: { text: '{{ parts.instruction }}\n{{ parts.safety }}', override: null },
    },
  });
});

test("it refuses the conversation's silent end on a turn that holds your message, and records the reply it then writes", async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'turn.end_silently', input: {} } },
    { text: 'Yes, the ferry runs on Sunday.' },
  );

  const records = await sendClientMessage(
    api.client,
    { text: 'Does the ferry run on Sunday?' },
    'Yes, the ferry runs on Sunday.',
  );

  const refused = ctx.toolResults.at(-1);
  const ended = records.find((record) => record.kind === 'model.turn_ended');
  const result: unknown = JSON.parse(refused?.result ?? '{}');

  expect({ name: refused?.name, result }).toStrictEqual({
    name: 'turn.end_silently',
    result: {
      _meta: {
        'io.modelcontextprotocol/serverInfo': { name: 'nixie', version: expect.any(String) },
      },
      content: [{ type: 'text', text: 'this turn has a message from the owner, so reply' }],
      isError: true,
    },
  });

  expect(ended).toStrictEqual({
    context: { size: expect.any(Number), window: 200_000 },
    kind: 'model.turn_ended',
    recordedAt: expect.any(Date),
    sequence: expect.any(Number),
    thread: 'conversation',
  });
});

test('it refuses a prompt_write proposal whose template reads a path the prompt does not accept, and keeps no proposal', async () => {
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { _template: '{{ parts.instruction }}\n{{ owner.birthday }}' },
          files: [],
          reason: 'Greet the owner on the day.',
        },
      },
    },
    { text: 'Refused.' },
  );

  await sendClientMessage(api.client, { text: 'Mention my birthday.' }, 'Refused.');

  const written = nixie.toolResults.at(-1);

  invariant(written);

  const answer: unknown = JSON.parse(written.result);

  const pending = await runHostCommand(nixie.configPath, ['prompt-pending']);

  expect(written.name).toBe('prompt_write');

  expect(answer).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: 'the override fails the definitions checks: nixie.yaml: the template of the compaction prompt reads {{ owner.birthday }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words, parts.instruction, parts.safety',
      },
    ],
  });

  expect(pending.stdout.trim()).toBe('[]');
});

test('it starts a task from the conversation, and lists it under the name the conversation gave', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    { text: 'I passed this to the Garden plan task, where it is queued.' },
  );

  await sendClientMessage(
    api.client,
    { text: 'Plan the vegetable beds for spring.' },
    'I passed this to the Garden plan task, where it is queued.',
  );

  const started = ctx.toolResults.at(-1);

  invariant(started);

  const answer = z
    .object({ structuredContent: z.object({ taskID: z.string(), name: z.string() }) })
    .parse(JSON.parse(started.result));

  const listed = await api.client.tasks.list({});

  expect(listed.tasks.find((task) => task.taskID === answer.structuredContent.taskID)?.name).toBe(
    'Garden plan',
  );
});

test('it refuses a task start from the conversation that gives the task tasks.definitions', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: {
          name: 'Chore check',
          brief: 'List the chores that run each week.',
          tools: ['tasks.definitions'],
        },
      },
    },
    { text: 'Refused.' },
  );

  await sendClientMessage(api.client, { text: 'Check the weekly chores.' }, 'Refused.');

  const refused = ctx.toolResults.at(-1);
  const result: unknown = JSON.parse(refused?.result ?? '{}');

  expect({ name: refused?.name, result }).toStrictEqual({
    name: 'task.start',
    result: {
      _meta: {
        'io.modelcontextprotocol/serverInfo': { name: 'nixie', version: expect.any(String) },
      },
      content: [
        {
          type: 'text',
          text: expect.stringMatching(
            /^only the conversation can use tasks\.definitions, so nixie started nothing\./u,
          ),
        },
      ],
      isError: true,
    },
  });

  expect(refused?.result).not.toInclude('tasks.definitions or mcp__nixie__tasks_definitions');
});

test('it holds a started task waiting with its message unread, and never fails it', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    { text: 'Started.' },
  );

  await sendClientMessage(api.client, { text: 'Plan the vegetable beds for spring.' }, 'Started.');

  const listed = await api.client.tasks.list({});

  const garden = listed.tasks.find((task) => task.name === 'Garden plan');

  invariant(garden);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.message',
        input: { to: garden.taskID, kind: 'report', body: 'Use the north bed for beans.' },
      },
    },
    { text: 'Passed on.' },
  );

  await sendClientMessage(api.client, { text: 'Beans go in the north bed.' }, 'Passed on.');

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: garden.taskID });

    return page.records.filter((record) => record.kind === 'task.step_committed').length >= 2;
  });

  const page = await api.client.conversation.read({ thread: garden.taskID });
  const after = await api.client.tasks.list({});

  expect(page.records.map((record) => record.kind)).not.toContain('task.step_errored');
  expect(after.tasks.find((task) => task.taskID === garden.taskID)?.state).toBe('waiting');
});

test('it closes a started task from the conversation with task.close, and shows the model no sandbox', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    { text: 'Started.' },
  );

  await sendClientMessage(api.client, { text: 'Plan the vegetable beds for spring.' }, 'Started.');

  const listed = await api.client.tasks.list({});

  const garden = listed.tasks.find((task) => task.name === 'Garden plan');

  invariant(garden);

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: garden.taskID });

    return page.records.some((record) => record.kind === 'task.step_committed');
  });

  ctx.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'task.close', input: { taskID: garden.taskID } } },
    { text: 'Closed it.', gate: () => held.promise },
  );

  const held = Promise.withResolvers<undefined>();

  const sent = sendClientMessage(
    api.client,
    { text: 'You can drop the garden plan.' },
    'Closed it.',
  );

  // The turn's token lists its tools only while the turn runs, so the reply holds it open.
  await waitForCondition(() => ctx.toolResults.some((result) => result.name === 'task.close'));

  const lastTurn = ctx.guest.received.findLast(
    (received) => received.owner === 'conversation' && received.frame.type === 'turn',
  );

  invariant(lastTurn);

  const tools = await ctx.readTools(lastTurn);

  held.resolve(undefined);

  await sent;

  const closeResult = ctx.toolResults.at(-1);

  invariant(closeResult);

  const answer = z
    .object({
      structuredContent: z.object({
        taskID: z.string(),
        name: z.string(),
        state: z.string(),
        wasClosed: z.boolean(),
      }),
    })
    .parse(JSON.parse(closeResult.result));

  const after = await api.client.tasks.read({ taskID: garden.taskID });
  const taskThread = await api.client.conversation.read({ thread: garden.taskID });
  const conversationThread = await api.client.conversation.read({ thread: 'conversation' });

  expect(answer.structuredContent).toStrictEqual({
    taskID: garden.taskID,
    name: 'Garden plan',
    state: 'closed',
    wasClosed: false,
  });

  expect(after).toMatchObject({ state: 'closed', closedBy: 'nixie' });

  expect(
    [
      closeResult.result,
      JSON.stringify(taskThread.records),
      JSON.stringify(conversationThread.records),
    ].join('\n'),
  ).not.toMatch(/sandbox/iu);

  const turns = ctx.guest.received.filter((received) => received.frame.type === 'turn');

  const shown = JSON.stringify({
    tools,
    turns: turns.map((received) =>
      received.frame.type === 'turn'
        ? { systemPrompt: received.frame.systemPrompt, input: received.frame.input }
        : null,
    ),
    results: ctx.toolResults,
  });

  const sandboxIDs = [
    ...new Set([
      ...ctx.guest.received.map((received) => received.sandboxID),
      ...ctx.guest.readSandboxIDs(),
    ]),
  ];

  expect(tools.map((tool) => z.object({ name: z.string() }).parse(tool).name)).toContain(
    'task.close',
  );

  expect(sandboxIDs.length).toBeGreaterThan(1);
  expect(sandboxIDs.filter((sandboxID) => shown.includes(sandboxID))).toStrictEqual([]);
});

test('it puts no task board in the turn after a task starts, and keeps the system prompt the same bytes between turns', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Seed order', brief: 'Order the bean and pea seed for spring.' },
      },
    },
    { text: 'Started.' },
    { text: 'The seed order is under way.' },
  );

  await sendClientMessage(api.client, { text: 'Order the spring seed.' }, 'Started.');

  await sendClientMessage(
    api.client,
    { text: 'How is the seed coming along?' },
    'The seed order is under way.',
  );

  const [first, second] = ctx.guest.received.flatMap((received) =>
    received.owner === 'conversation' && received.frame.type === 'turn' ? [received.frame] : [],
  );

  invariant(first);
  invariant(second);

  expect(second.systemPrompt).toBe(first.systemPrompt);
  expect(second.systemPrompt).not.toInclude('Seed order');
  expect(JSON.stringify(second.input)).not.toInclude('Seed order');
});

test("it serves search to the conversation with the key from the secrets file, shows the model no cost, and keeps the search's cost on the call's record", async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  await kagiStore.results.create({
    query: 'low tide today',
    url: 'https://tides.test/bondi',
    title: 'Bondi tide times',
    snippet: 'Low tide at 13:40.',
    time: '2026-11-06T21:00:00Z',
  });

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'low tide today' } } },
    { text: 'Low tide is at 13:40.' },
  );

  const records = await sendClientMessage(
    api.client,
    { text: 'When is low tide at Bondi?' },
    'Low tide is at 13:40.',
  );

  const searched = nixie.toolResults.at(-1);

  invariant(searched);

  const answer: unknown = JSON.parse(searched.result);

  const hits = [
    {
      link: 'L1',
      title: 'Bondi tide times',
      url: 'https://tides.test/bondi',
      snippet: 'Low tide at 13:40.',
      date: '2026-11-06',
    },
  ];

  expect(answer).toStrictEqual({
    _meta: expect.any(Object),
    content: [],
    structuredContent: { hits },
  });

  expect(records.find((record) => record.kind === 'tool_result')?.toolCall).toStrictEqual({
    callID: expect.any(String),
    runID: 'conversation',
    outcome: 'result',
    content: { result: { hits }, hidden: { costUSD: 0.012 } },
  });
});

test('it keeps the search key out of every record, log event and sandbox', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', '  search: invented-search-key'],
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: 'invented-search-key' });

  await kagiStore.results.create({
    query: 'ferry timetable',
    url: 'https://ferries.test/manly',
    title: 'Manly ferry',
    snippet: 'Every 30 minutes.',
  });

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Every 30 minutes.' },
  );

  await sendClientMessage(api.client, { text: 'When is the next ferry?' }, 'Every 30 minutes.');

  nixie.signalStop();

  const exited = await nixie.waitForExit();
  const files = await nixie.readDataFiles();

  expect({
    records: JSON.stringify(exited.records).includes('invented-search-key'),
    toolResults: JSON.stringify(nixie.toolResults).includes('invented-search-key'),
    files: files
      .filter((file) => file.text.includes('invented-search-key'))
      .map((file) => file.name),
    logEvents: JSON.stringify(nixie.readLogEvents()).includes('invented-search-key'),
    sandboxFiles: nixie.guest.collectFilesWithText('invented-search-key'),
    sandboxFrames: JSON.stringify(nixie.guest.received).includes('invented-search-key'),
  }).toStrictEqual({
    records: false,
    toolResults: false,
    files: [],
    logEvents: false,
    sandboxFiles: [],
    sandboxFrames: false,
  });
});

test('it refuses the second search of a day under the cap of 1 the configuration sets', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: [
      'search:',
      '  daily_call_cap: 1',
      '  credential: deployment:search',
      `  api_url: ${kagiAPIURL}`,
    ],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { toolUse: { name: 'search', input: { query: 'bus timetable' } } },
    { text: 'Searched twice.' },
  );

  await sendClientMessage(api.client, { text: 'How do I get to Manly?' }, 'Searched twice.');

  const refused = nixie.toolResults.at(-1);
  const result: unknown = JSON.parse(refused?.result ?? '{}');

  expect({ name: refused?.name, result }).toStrictEqual({
    name: 'search',
    result: {
      _meta: {
        'io.modelcontextprotocol/serverInfo': { name: 'nixie', version: expect.any(String) },
      },
      content: [
        {
          type: 'text',
          text: expect.stringMatching(
            /^the search cap of 1 calls a day is reached, and it resets at midnight Australia\/Sydney time, when \d{4}-\d{2}-\d{2} starts$/u,
          ),
        },
      ],
      isError: true,
    },
  });
});

test('it charges a search to its day and month budgets before Kagi sees it', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
  });

  const api = await createTestClient(nixie);

  const seen: unknown[] = [];

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  kagiStore.hooks.onRequest = async () => {
    const day = await readHostLedger(nixie.configPath, 'search-day');
    const month = await readHostLedger(nixie.configPath, 'search-month');

    seen.push({ day: day.spentMicros, month: month.spentMicros });
  };

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Searched.' },
  );

  await sendClientMessage(api.client, { text: 'How do I get to Manly?' }, 'Searched.');

  const day = await readHostLedger(nixie.configPath, 'search-day');
  const month = await readHostLedger(nixie.configPath, 'search-month');

  expect(seen).toStrictEqual([{ day: 12_000, month: 12_000 }]);
  expect(day.spentMicros).toBe(12_000);
  expect(month.spentMicros).toBe(12_000);
});

test('it credits both charges of a search that Kagi fails', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Failed.' },
  );

  await sendClientMessage(api.client, { text: 'How do I get to Manly?' }, 'Failed.');

  const day = await readHostLedger(nixie.configPath, 'search-day');
  const month = await readHostLedger(nixie.configPath, 'search-month');

  expect(kagiStore.requests.findMany()).toHaveLength(1);
  expect(day.spentMicros).toBe(0);
  expect(month.spentMicros).toBe(0);
  expect(day.charges).toHaveLength(1);
  expect(month.charges).toHaveLength(1);
});

test('it refuses a search whose day budget is full, with the budget notice, and Kagi sees nothing', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
    beforeStart: (files) =>
      seedPaidBudgetSpend(files, {
        tool: 'search',
        budgetID: 'search-day',
        amountMicros: 5_000_000,
      }),
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: 'kagi-key-a' });

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Refused.' },
  );

  const records = await sendClientMessage(
    api.client,
    { text: 'How do I get to Manly?' },
    'Refused.',
  );

  const refused = nixie.toolResults.at(-1);
  const result: unknown = JSON.parse(refused?.result ?? '{}');

  const noticeMessage = records.findLast((record) => record.toolCall?.outcome !== undefined)
    ?.toolCall?.content?.['message'];

  expect(result).toMatchObject({
    content: [
      {
        type: 'text',
        text: 'budget reached: search-day ($5.00 of $5.00). Resets at midnight.',
      },
    ],
    isError: true,
  });

  expect(noticeMessage).toBe('budget reached: search-day ($5.00 of $5.00). Resets at midnight.');
  expect(kagiStore.requests.findMany()).toHaveLength(0);
});

test('it counts a search that Kagi fails against the daily cap, and refuses the next without a charge', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: [
      'search:',
      '  daily_call_cap: 1',
      '  credential: deployment:search',
      `  api_url: ${kagiAPIURL}`,
    ],
    extraSecrets: ['connector_credentials:', '  search: kagi-key-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { toolUse: { name: 'search', input: { query: 'bus timetable' } } },
    { text: 'Searched twice.' },
  );

  await sendClientMessage(api.client, { text: 'How do I get to Manly?' }, 'Searched twice.');

  const refused = nixie.toolResults.at(-1);

  const day = await readHostLedger(nixie.configPath, 'search-day');

  expect(refused?.result).toInclude('the search cap of 1 calls a day is reached');
  expect(kagiStore.requests.findMany()).toHaveLength(1);
  expect(day.charges).toHaveLength(1);
  expect(day.spentMicros).toBe(0);
});

test('it offers no search tool when the configuration names no search credential', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).not.toContain('search');
});

test('it lets no registered tool run a call that no rule in force allows', async () => {
  const ctx = await startInProcessNixie({ isStarterApproved: false });
  const api = await createTestClient(ctx);

  const gate = Promise.withResolvers<void>();

  await ctx.waitForLogEvent('ready');

  ctx.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => ctx.guest.turns.length === 1);

  const [received] = ctx.guest.received;

  invariant(received);

  const names = await ctx.readToolNames(received);
  const answers = await Promise.all(names.map((name) => ctx.callTool(received, name, {})));

  gate.resolve();

  const ran = answers.flatMap((answer, index) =>
    answer.includes('"isError":true') || answer.includes('Waiting for approval')
      ? []
      : [`${names[index] ?? '?'}: ${answer}`],
  );

  expect(
    answers.filter((answer) => answer.includes('Waiting for approval')).length,
  ).toBeGreaterThan(3);

  expect(ran).toStrictEqual([]);
});
