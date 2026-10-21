import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTimeTool } from '@heynixie/connectors';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildSkillTools } from '@heynixie/skills';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildConversationTools } from './build-conversation-tools';
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

test('it lists the web fetch tool, the time tool, the log reader, the skill tools and the 11 memory tools', async () => {
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
    'memory.recall',
    'memory.rate',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.diff',
    'memory.comment',
    'memory.export',
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
