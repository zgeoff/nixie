import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import type { Server as BunServer } from 'bun';
import { buildToolServerEntry } from '../build-tool-server-entry';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export async function runToolCallWaitProbe(
  target: ProbeTarget,
  toolDelayMs: number,
): Promise<ContractRun> {
  const handler = createMcpHandler(() => createWaitingServer(toolDelayMs));
  const answerRequest = (request: Request): Promise<Response> => handler.fetch(request);

  const server: BunServer<undefined> = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  try {
    const options = buildProbeOptions(target);

    return await runContractQuery({
      prompt: 'Call the wait_then_answer tool once, then reply with DONE.',
      options: {
        ...options,
        allowedTools: ['mcp__nixie'],
        permissionMode: 'dontAsk',
        maxTurns: 3,
        systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
        mcpServers: {
          nixie: buildToolServerEntry(
            { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
            2000,
          ),
        },
      },
    });
  } finally {
    await handler.close();
    await server.stop(true);
  }
}

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the probe lists one plain schema as nixie's endpoint does
export const toolCallWaitProbeToolName = 'mcp__nixie__wait_then_answer';
export const toolCallWaitProbeText = 'the lamp oil is full';

function createWaitingServer(toolDelayMs: number): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'wait_then_answer',
        description: 'Reads the lamp oil gauge.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler('tools/call', async () => {
    await Bun.sleep(toolDelayMs);

    return { content: [{ type: 'text', text: toolCallWaitProbeText }] };
  });

  return server;
}
