import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTimeTool } from '@heynixie/connectors';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildPromptReadTool } from '@heynixie/prompts';
import { buildSkillTools } from '@heynixie/skills';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildConversationTools } from './build-conversation-tools';
import { createApprovedItems } from './test-utils/create-approved-items';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-conversation-tools-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  return { log, logRead: buildLogReadTool(log) };
}

test('it lists the web fetch tool, the time tool, the log reader, the skill tools, the prompt reader and the 11 memory tools', async () => {
  const ctx = await setupTest();

  const definitions = buildConversationTools(
    {
      webFetch: {
        name: 'web.fetch',
        description: 'Reads one public page.',
        input: {
          type: 'object',
          properties: { url: { type: 'string' } },
          additionalProperties: false,
        },
        output: { type: 'object', properties: { text: { type: 'string' } } },
        declaration: {
          effects: ['fetch'],
          destinations: ['url'],
          amount: null,
          content: [],
          results: { text: 'untrusted' },
        },
        execution: 'direct',
        run: () => Promise.resolve({ status: 'ok', result: { text: 'page' } }),
      },
      time: buildTimeTool({
        clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
        findTimeZone: () => Promise.resolve(null),
        defaultZone: 'Australia/Sydney',
      }),
      logRead: ctx.logRead,
      skills: buildSkillTools({
        log: ctx.log,
        clock: buildTestClock(0),
        readInForce: () => null,
        refreshDefinitions: () => Promise.resolve(null),
        readSkillList: () => [],
      }),
      prompts: [buildPromptReadTool({ readInForce: () => null })],
    },
    {
      readStore: () => null,
      clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
      ownerName: null,
      agentName: null,
      defaultZone: 'Australia/Sydney',
    },
  );

  expect(definitions.map((definition) => definition.name)).toStrictEqual([
    'web.fetch',
    'time.now',
    'log.read',
    'skill_read',
    'skill_reload',
    'skill_reload_all',
    'skill_write',
    'skill_pending',
    'prompt_read',
    'memory.recall',
    'memory.rate',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.pin',
    'memory.unpin',
    'memory.diff',
    'memory.comment',
    'memory.export',
  ]);
});

test("it unpins an item through memory.unpin at once, and the next turn's change note names it with the core's count and tokens", async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);
  const [item] = await createApprovedItems(nixie, api.client, ['Runs a book club on Tuesdays']);

  await runHostCommand(nixie.configPath, ['memory-pin', item.itemID]);

  const shown = await api.client.memory.readItem({ itemID: item.itemID });
  const pinned = await api.client.memory.readPinnedCore();

  nixie.guest.addReplies(
    { text: 'Morning.' },
    { toolUse: { name: 'memory.unpin', input: { itemID: shown.shortID } } },
    { text: 'Unpinned it.' },
    { text: 'Sure.' },
  );

  await sendClientMessage(api.client, { text: 'Morning!' }, 'Morning.');

  await sendClientMessage(
    api.client,
    { text: 'Take the book club out of the core.' },
    'Unpinned it.',
  );

  await sendClientMessage(api.client, { text: 'Thanks.' }, 'Sure.');

  const core = await api.client.memory.readPinnedCore();

  const [opening, afterPin, , afterUnpin] = nixie.guest.turns;

  expect(core.items).toStrictEqual([]);

  expect(opening?.input).toMatchObject([
    {
      text: expect.toInclude(
        `- Pinned memory: 0 items\n- Pinned memory tokens: 0 of ${String(pinned.budget)}`,
      ),
    },
  ]);

  expect(afterPin?.input).toMatchObject([
    {
      text: expect.toInclude(
        `Pinned memory now: 1 item, ${String(pinned.tokens)} of ${String(pinned.budget)} tokens.`,
      ),
    },
  ]);

  expect(afterUnpin?.input).toMatchObject([
    {
      text: expect.toInclude(
        `- Unpinned [${shown.shortID}]\nPinned memory now: 0 items, 0 of ${String(pinned.budget)} tokens.`,
      ),
    },
  ]);
});

test('it fails a memory call that runs before the memory store starts', async () => {
  const ctx = await setupTest();

  const definitions = buildConversationTools(
    {
      webFetch: {
        name: 'web.fetch',
        description: 'Reads one public page.',
        input: {
          type: 'object',
          properties: { url: { type: 'string' } },
          additionalProperties: false,
        },
        output: { type: 'object', properties: { text: { type: 'string' } } },
        declaration: {
          effects: ['fetch'],
          destinations: ['url'],
          amount: null,
          content: [],
          results: { text: 'untrusted' },
        },
        execution: 'direct',
        run: () => Promise.resolve({ status: 'ok', result: { text: 'page' } }),
      },
      time: buildTimeTool({
        clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
        findTimeZone: () => Promise.resolve(null),
        defaultZone: 'Australia/Sydney',
      }),
      logRead: ctx.logRead,
      skills: [],
      prompts: [],
    },
    {
      readStore: () => null,
      clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
      ownerName: null,
      agentName: null,
      defaultZone: 'Australia/Sydney',
    },
  );

  const recall = definitions.find((definition) => definition.name === 'memory.recall');

  expect(
    recall?.run(
      { callID: 'call-1', tool: 'memory.recall', input: {}, toolUseID: null },
      {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          tools: [],
          model: { model: 'claude-test-1', profile: 'chat-direct' },
        },
      },
    ),
  ).rejects.toThrowWithMessage(Error, 'a tool call ran before the memory store started');
});

test('it allows the time tool, the log reader and each memory tool but export, and denies a write tool under the read-only rule', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry([
    ...buildConversationTools(
      {
        webFetch: {
          name: 'web.fetch',
          description: 'Reads one public page.',
          input: {
            type: 'object',
            properties: { url: { type: 'string' } },
            additionalProperties: false,
          },
          output: { type: 'object', properties: { text: { type: 'string' } } },
          declaration: {
            effects: ['fetch'],
            destinations: ['url'],
            amount: null,
            content: [],
            results: { text: 'untrusted' },
          },
          execution: 'direct',
          run: () => Promise.resolve({ status: 'ok', result: { text: 'page' } }),
        },
        time: buildTimeTool({
          clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
          findTimeZone: () => Promise.resolve(null),
          defaultZone: 'Australia/Sydney',
        }),
        logRead: ctx.logRead,
        skills: [],
        prompts: [],
      },
      {
        readStore: () => null,
        clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
        ownerName: null,
        agentName: null,
        defaultZone: 'Australia/Sydney',
      },
    ),
    {
      name: 'files.write',
      description: 'Writes a file.',
      input: { type: 'object', properties: {}, additionalProperties: false },
      output: { type: 'object', properties: { text: { type: 'string' } } },
      declaration: {
        effects: ['write'],
        destinations: [],
        amount: null,
        content: [],
        results: { text: 'owner_data' },
      },
      execution: 'queued',
      run: () => Promise.resolve({ status: 'ok', result: { text: 'done' } }),
    },
  ]);

  const decide = makeDecisionPoint({
    findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
  });

  const readTools = [
    'time.now',
    'log.read',
    'memory.recall',
    'memory.rate',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.pin',
    'memory.unpin',
    'memory.diff',
    'memory.comment',
  ];

  const toolList = ['web.fetch', ...readTools, 'files.write'];

  const allowed = {
    decision: {
      outcome: 'allow' as const,
      stage: 3,
      rule: { id: 'slice1.read-only', revision: 1 },
    },
    sentence: null,
  };

  expect(readTools.map((tool) => decide({ tool, toolList }))).toStrictEqual(
    readTools.map(() => allowed),
  );

  expect(decide({ tool: 'files.write', toolList })).toMatchObject({
    decision: { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only' } },
  });
});

test('it offers no tool that approves, rejects or edits a consolidation change', async () => {
  const ctx = await setupTest();

  const definitions = buildConversationTools(
    {
      webFetch: {
        name: 'web.fetch',
        description: 'Reads one public page.',
        input: {
          type: 'object',
          properties: { url: { type: 'string' } },
          additionalProperties: false,
        },
        output: { type: 'object', properties: { text: { type: 'string' } } },
        declaration: {
          effects: ['fetch'],
          destinations: ['url'],
          amount: null,
          content: [],
          results: { text: 'untrusted' },
        },
        execution: 'direct',
        run: () => Promise.resolve({ status: 'ok', result: { text: 'page' } }),
      },
      time: buildTimeTool({
        clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
        findTimeZone: () => Promise.resolve(null),
        defaultZone: 'Australia/Sydney',
      }),
      logRead: ctx.logRead,
      skills: [],
      prompts: [],
    },
    {
      readStore: () => null,
      clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
      ownerName: null,
      agentName: null,
      defaultZone: 'Australia/Sydney',
    },
  );

  const inputs = definitions.map(
    (definition) => [definition.name, Object.keys(definition.input['properties'] ?? {})] as const,
  );

  expect(inputs).toSatisfyAll(
    ([, keys]: readonly [string, readonly string[]]) => !keys.includes('actionHash'),
  );

  expect(inputs.filter(([, keys]) => keys.includes('changeID'))).toStrictEqual([
    ['memory.comment', ['changeID', 'comment']],
  ]);
});

test('it denies a model call to memory.export under the read-only rule, so nothing exports', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry(
    buildConversationTools(
      {
        webFetch: {
          name: 'web.fetch',
          description: 'Reads one public page.',
          input: {
            type: 'object',
            properties: { url: { type: 'string' } },
            additionalProperties: false,
          },
          output: { type: 'object', properties: { text: { type: 'string' } } },
          declaration: {
            effects: ['fetch'],
            destinations: ['url'],
            amount: null,
            content: [],
            results: { text: 'untrusted' },
          },
          execution: 'direct',
          run: () => Promise.resolve({ status: 'ok', result: { text: 'page' } }),
        },
        time: buildTimeTool({
          clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
          findTimeZone: () => Promise.resolve(null),
          defaultZone: 'Australia/Sydney',
        }),
        logRead: ctx.logRead,
        skills: [],
        prompts: [],
      },
      {
        readStore: () => null,
        clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
        ownerName: null,
        agentName: null,
        defaultZone: 'Australia/Sydney',
      },
    ),
  );

  const result = await runToolCall(
    { tool: 'memory.export', input: {}, toolUseID: 'toolu_1' },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.export'],
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    {
      registry,
      decide: makeDecisionPoint({
        findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
      }),
      log: ctx.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      queue: {
        enqueue: () => Promise.reject(new Error('a denied call reached the queue')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: 'denied: slice1.read-only: Only a tool whose effects are read, fetch or note may run; every other call is denied.',
      },
    ],
    isError: true,
  });
});
