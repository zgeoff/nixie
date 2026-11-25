import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import type { Server as BunServer } from 'bun';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export const oneOfStartToolName = 'mcp__nixie__task_start';

export interface OneOfStartRun {
  readonly run: ContractRun;

  // the arguments of each call the model made to the start tool
  readonly calls: readonly Readonly<Record<string, unknown>>[];
}

// Calls the model with a start tool whose input schema is a `oneOf` under the object root, with the
// sandbox variant and a coding variant, and asks it to start a coding task.
export async function runOneOfStartProbe(target: ProbeTarget): Promise<OneOfStartRun> {
  const calls: Record<string, unknown>[] = [];
  const handler = createMcpHandler(() => createStartServer(calls));
  const answerRequest = (request: Request): Promise<Response> => handler.fetch(request);

  const server: BunServer<undefined> = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  try {
    const run = await runContractQuery({
      prompt:
        'Start a coding task named "Fix the flaky login test" on the repository ' +
        'https://github.com/example/shop.git at the ref main. Its brief is: "The login test ' +
        'fails 1 time in 5 on CI. Find why and open a pull request with the fix." Call the ' +
        'task_start tool once, then reply DONE.',
      options: {
        ...buildProbeOptions(target),
        allowedTools: ['mcp__nixie'],
        permissionMode: 'dontAsk',
        strictMcpConfig: true,
        maxTurns: 3,
        systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
        mcpServers: {
          nixie: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
        },
      },
    });

    return { run, calls };
  } finally {
    await handler.close();
    await server.stop(true);
  }
}

const sandboxVariant = {
  type: 'object',
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

const codingVariant = {
  type: 'object',
  properties: {
    runner: {
      type: 'string',
      const: 'atc',
      description: 'atc starts a coding agent on a repository, or joins a coding session',
    },
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
  required: ['runner', 'name', 'brief'],
  oneOf: [{ required: ['repo'] }, { required: ['session'] }],
  additionalProperties: false,
};

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the probe lists one plain schema as nixie's endpoint does
function createStartServer(calls: Record<string, unknown>[]): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'task_start',
        description: 'Starts a new task: a sandbox task, or a coding task on a repository.',
        inputSchema: { type: 'object' as const, oneOf: [sandboxVariant, codingVariant] },
      },
    ],
  }));

  server.setRequestHandler('tools/call', (request) => {
    calls.push(request.params.arguments ?? {});

    return { content: [{ type: 'text' as const, text: '{"taskID":"t7k2"}' }] };
  });

  return server;
}
