import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import type { Server as BunServer } from 'bun';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export const startToolNames = ['mcp__nixie__task_start', 'mcp__nixie__coding_start'] as const;

export interface StartToolsRun {
  readonly run: ContractRun;

  // the tool names that the SDK's init message reports, as the model sees them
  readonly tools: readonly string[];
}

// Starts the SDK against an MCP server that lists a sandbox start tool and a coding start tool,
// each with a plain object root, and reads the tools that the init message reports.
export async function runStartToolsProbe(target: ProbeTarget): Promise<StartToolsRun> {
  const handler = createMcpHandler(() => createStartServer());
  const answerRequest = (request: Request): Promise<Response> => handler.fetch(request);

  const server: BunServer<undefined> = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  try {
    const run = await runContractQuery({
      prompt: 'Reply DONE.',
      options: {
        ...buildProbeOptions(target),
        allowedTools: ['mcp__nixie'],
        permissionMode: 'dontAsk',
        strictMcpConfig: true,
        maxTurns: 1,
        systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
        mcpServers: {
          nixie: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
        },
      },
    });

    const init = run.messages.find(
      (message) => message.type === 'system' && message.subtype === 'init',
    );

    return {
      run,
      tools: init?.type === 'system' && init.subtype === 'init' ? init.tools : [],
    };
  } finally {
    await handler.close();
    await server.stop(true);
  }
}

const sandboxStart = {
  type: 'object' as const,
  properties: {
    runner: { type: 'string', const: 'sandbox' },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    brief: { type: 'string', minLength: 1, maxLength: 8000 },
    persona: { type: 'string', enum: ['default', 'none'] },
    memory: { type: 'string', enum: ['none', 'read'] },
    report: { type: 'string', enum: ['wake', 'next_turn', 'none'] },
  },
  required: ['name', 'brief'],
  additionalProperties: false,
};

const codingStart = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    brief: { type: 'string', minLength: 1, maxLength: 8000 },
    repo: {
      type: 'object',
      properties: { url: { type: 'string' }, ref: { type: 'string' } },
      required: ['url', 'ref'],
      additionalProperties: false,
      description: 'the repository to start a session on; leave it out to join a session',
    },
    target: { type: 'string', description: 'only with repo' },
    agent: { type: 'string', description: 'only with repo' },
    model: { type: 'string', description: 'only with repo' },
    session: {
      type: 'string',
      description: 'the short ID of the session to join; leave it out with a repo',
    },
    wake: { type: 'array', items: { type: 'string', enum: ['waiting', 'idle', 'ended'] } },
  },
  required: ['name', 'brief'],
  additionalProperties: false,
};

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the probe lists plain schemas as nixie's endpoint does
function createStartServer(): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'task_start',
        description: 'Starts a new sandbox task.',
        inputSchema: sandboxStart,
      },
      {
        name: 'coding_start',
        description: 'Starts a coding task on a repository, or joins a running session.',
        inputSchema: codingStart,
      },
    ],
  }));

  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text' as const, text: '{"taskID":"t7k2"}' }],
  }));

  return server;
}
