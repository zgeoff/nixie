import { expect, test } from 'bun:test';
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

test('it lists the web fetch tool and the 3 memory tools', () => {
  const definitions = buildConversationTools(buildWebFetchStandIn(), () => null);

  expect(definitions.map((definition) => definition.name)).toStrictEqual([
    'web.fetch',
    'memory.recall',
    'memory.remember',
    'memory.retire',
  ]);
});

test('it fails a memory call that runs before the memory store starts', () => {
  const definitions = buildConversationTools(buildWebFetchStandIn(), () => null);
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

test('it allows each memory tool and denies a write tool under the read-only rule', () => {
  const standIn: ToolDefinition = {
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
  const registry = buildToolRegistry([
    ...buildConversationTools(buildWebFetchStandIn(), () => null),
    standIn,
  ]);
  const decide = makeDecisionPoint({
    findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
  });
  const toolList = [
    'web.fetch',
    'memory.recall',
    'memory.remember',
    'memory.retire',
    'files.write',
  ];
  const allowed = {
    decision: {
      outcome: 'allow' as const,
      stage: 3,
      rule: { id: 'slice1.read-only', revision: 1 },
    },
    sentence: null,
  };

  expect(decide({ tool: 'memory.recall', toolList })).toStrictEqual(allowed);
  expect(decide({ tool: 'memory.remember', toolList })).toStrictEqual(allowed);
  expect(decide({ tool: 'memory.retire', toolList })).toStrictEqual(allowed);
  expect(decide({ tool: 'files.write', toolList })).toMatchObject({
    decision: { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only' } },
  });
});
