import { expect, test } from 'bun:test';
import { buildTimeTool } from '@heynixie/connectors';
import { makeDecisionPoint } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry } from '@heynixie/tools';
import { buildConversationTools } from './build-conversation-tools';

// the web fetch tool's stand-in: a fetch tool the registry accepts
function buildWebFetchStandIn(): ToolDefinition {
  return {
    name: 'web.fetch',
    description: 'Reads one public page.',
    input: { type: 'object', properties: { url: { type: 'string' } }, additionalProperties: false },
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
  };
}

// the time tool on a fixed clock, with no message zone
function buildTimeStandIn(): ToolDefinition {
  return buildTimeTool({
    clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
    findTimeZone: () => Promise.resolve(null),
    defaultZone: 'Australia/Sydney',
  });
}

// a write tool that the read-only rule denies
function buildWriteStandIn(): ToolDefinition {
  return {
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
  };
}

test('it lists the web fetch tool, the time tool and the 7 memory tools', () => {
  const definitions = buildConversationTools(buildWebFetchStandIn(), buildTimeStandIn(), {
    readStore: () => null,
    clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
  });

  expect(definitions.map((definition) => definition.name)).toStrictEqual([
    'web.fetch',
    'time.now',
    'memory.recall',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.diff',
    'memory.comment',
  ]);
});

test('it fails a memory call that runs before the memory store starts', () => {
  const definitions = buildConversationTools(buildWebFetchStandIn(), buildTimeStandIn(), {
    readStore: () => null,
    clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
  });
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

test('it allows the time tool and each memory tool and denies a write tool under the read-only rule', () => {
  const registry = buildToolRegistry([
    ...buildConversationTools(buildWebFetchStandIn(), buildTimeStandIn(), {
      readStore: () => null,
      clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
    }),
    buildWriteStandIn(),
  ]);
  const decide = makeDecisionPoint({
    findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
  });
  const readTools = [
    'time.now',
    'memory.recall',
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

test('it offers no tool that approves, rejects or edits a consolidation change', () => {
  const definitions = buildConversationTools(buildWebFetchStandIn(), buildTimeStandIn(), {
    readStore: () => null,
    clock: { now: () => Date.parse('2026-10-13T22:30:15.000Z') },
  });
  const inputs = definitions.map(
    (definition) => [definition.name, Object.keys(definition.input['properties'] ?? {})] as const,
  );

  // an answer to a change binds to its action hash, so a tool that takes none cannot answer one
  expect(inputs).toSatisfyAll(
    ([, keys]: readonly [string, readonly string[]]) => !keys.includes('actionHash'),
  );
  expect(inputs.filter(([, keys]) => keys.includes('changeID'))).toStrictEqual([
    ['memory.comment', ['changeID', 'comment']],
  ]);
});
