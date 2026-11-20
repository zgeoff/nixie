import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import type { Server as BunServer } from 'bun';
import { buildToolServerEntry } from '../utils/build-tool-server-entry';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

export const endTurnProbeToolName = 'mcp__nixie__end_now';

// The tool answers with the end-turn key in the result's _meta, as a nixie tool that ends its turn does.
export async function runEndTurnProbe(target: ProbeTarget): Promise<ContractRun> {
  const handler = createMcpHandler(() => createEndingServer());
  const answerRequest = (request: Request): Promise<Response> => handler.fetch(request);

  const server: BunServer<undefined> = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  try {
    const options = buildProbeOptions(target);

    return await runContractQuery({
      prompt: 'Call the end_now tool once. Write nothing after it.',
      options: {
        ...options,
        allowedTools: ['mcp__nixie'],
        permissionMode: 'dontAsk',
        maxTurns: 5,
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
function createEndingServer(): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'end_now',
        description: 'Ends the turn.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text', text: 'the turn ends here' }],
    _meta: { 'claude/endTurn': true },
  }));

  return server;
}
