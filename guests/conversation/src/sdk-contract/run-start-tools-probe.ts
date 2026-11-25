import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import type { Server as BunServer } from 'bun';
import { z } from 'zod';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

const probeToolSchema = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.looseObject({ type: z.literal('object') }),
});

const probeToolsSchema = z.array(probeToolSchema);

export interface StartToolsRun {
  readonly run: ContractRun;

  // the tool names that the SDK's init message reports, as the model sees them
  readonly tools: readonly string[];
}

// Starts the SDK against an MCP server that lists the given tools, which a test reads from nixie's
// own endpoint, and reads the tools that the init message reports.
export async function runStartToolsProbe(
  target: ProbeTarget,
  listed: readonly unknown[],
): Promise<StartToolsRun> {
  const tools = probeToolsSchema.parse(listed);
  const handler = createMcpHandler(() => createStartServer(tools));
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

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the probe lists nixie's own tools as they are
function createStartServer(tools: z.infer<typeof probeToolsSchema>): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({ tools }));

  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text' as const, text: '{"taskID":"t7k2"}' }],
  }));

  return server;
}
