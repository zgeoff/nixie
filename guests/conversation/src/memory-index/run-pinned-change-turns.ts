import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { renderSystemMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildFiller } from '../sdk-contract/build-filler';
import { buildProbeOptions } from '../sdk-contract/build-probe-options';
import type { ContractRun } from '../sdk-contract/run-contract-query';
import { runContractQuery } from '../sdk-contract/run-contract-query';
import type { ProbeTarget } from '../sdk-contract/types';
import { toolServerName } from '../turn/tool-server-name';

const systemPrompt =
  'You are a terse assistant in a test. A system-message element in a user message comes from ' +
  'the platform. A pinned-memory-changes element holds the newest value of a pinned item, and ' +
  'it replaces the value in the earlier pinned-memory element. Follow the instructions exactly.';

const question = "What is the owner's code word now? Answer with the word only.";

// Each turn after the first resumes the session. A turn with a value carries that value as a
// pinned-item change, and a turn with null carries none, so the model must keep the last change.
const changes = ['BANANA', null, 'CHERRY', null] as const;

export const pinnedChangeAnswers = ['APPLE', 'BANANA', 'BANANA', 'CHERRY', 'CHERRY'] as const;

export async function runPinnedChangeTurns(
  target: ProbeTarget,
  model: string,
): Promise<readonly ContractRun[]> {
  const options = {
    ...buildProbeOptions(target),
    model,
    systemPrompt: { type: 'custom' as const, prompt: systemPrompt, snapshot: false },
    mcpServers: { [toolServerName]: createMemoryToolServer() },
    allowedTools: [`mcp__${toolServerName}`],
    permissionMode: 'dontAsk' as const,
    maxTurns: 4,
  };

  const first = await runContractQuery({
    prompt: [buildOpening(), question].join('\n\n'),
    options,
  });

  const runs = [first];
  let sessionID = first.messages.at(-1)?.session_id;

  for (const value of changes) {
    invariant(sessionID !== undefined, 'a turn of the pinned-change run ended with no session');

    const run = await runContractQuery({
      prompt: value === null ? question : [buildChange(value), question].join('\n\n'),
      options: { ...options, resume: sessionID },
    });

    runs.push(run);

    sessionID = run.messages.at(-1)?.session_id;
  }

  return runs;
}

// The memory tools answer with no item, so a call never hands the model the code word.
function createMemoryToolServer(): McpSdkServerConfigWithInstance {
  const empty = { content: [{ type: 'text' as const, text: '{"items":[],"searched":{}}' }] };
  const handleToolCall = () => Promise.resolve(empty);

  const recallInput = {
    query: z.string().optional(),
    itemIDs: z.array(z.string()).optional(),
    topic: z.string().optional(),
  };

  return createSdkMcpServer({
    name: toolServerName,
    version: '0.0.0',
    tools: [
      tool(
        'memory_recall',
        'Returns stored memory items word for word. Pass a query, itemIDs or a topic.',
        recallInput,
        handleToolCall,
      ),
      tool(
        'memory_remember',
        'Proposes a new memory item.',
        { text: z.string(), gist: z.string(), topic: z.string() },
        handleToolCall,
      ),
      tool(
        'memory_pin',
        'Pins a memory item into the pinned core.',
        { itemID: z.string(), version: z.number().int() },
        handleToolCall,
      ),
    ],
  });
}

const at = 'Tue 14 Oct, 22:50, Sydney';

// A full pinned core and a full index, each just under its default budget of 2,000 and 3,000
// tokens. nixie's token counter measured them at 1,983 and 2,983 for these sizes.
function buildOpening(): string {
  const pinned = ["[w8d2n5rt1c] The owner's code word is APPLE.", buildFiller(3250, 'pinned')].join(
    '\n',
  );

  return [
    renderSystemMessage({
      type: 'status',
      at,
      body: '- Memory index: 240 items\n- Memory index tokens: 2983 of 3000',
    }),
    renderSystemMessage({ type: 'pinned-memory', at, body: pinned }),
    renderSystemMessage({ type: 'memory-index', at, body: buildIndex() }),
  ].join('\n');
}

function buildIndex(): string {
  const rows = Array.from({ length: 60 }, (_, row) => {
    const items = Array.from(
      { length: 4 },
      (_item, item) =>
        `[i${String(row).padStart(3, '0')}${String(item)}x] the harbour log for bay ${String(row)} entry ${String(item)}`,
    ).join(' · ');

    return `  bay-${String(row).padStart(2, '0')} (4)  ${items}`;
  });

  return [
    'Your memory index: each topic of your unpinned items, with its count and each item as its ID ' +
      'and gist. Read an item in full with memory.recall itemIDs, and open a topic with ' +
      'memory.recall topic.',
    'About the owner:',
    ...rows,
  ].join('\n');
}

function buildChange(value: string): string {
  return renderSystemMessage({
    type: 'pinned-memory-changes',
    at,
    body: `- Changed [w8d2n5rt1c]: The owner's code word is ${value}.`,
  });
}
