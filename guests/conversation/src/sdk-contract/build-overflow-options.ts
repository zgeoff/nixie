import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { buildFiller } from './build-filler';
import { buildProbeOptions } from './build-probe-options';
import type { ProbeTarget } from './types';

export function buildOverflowOptions(target: ProbeTarget): Options {
  const pages = createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool('read_page', 'Reads one page of the harbour log.', { page: z.number().int() }, (args) =>
        Promise.resolve({
          content: [{ type: 'text', text: buildFiller(4000, `page ${args.page}`) }],
        }),
      ),
    ],
  });

  const options = buildProbeOptions(target);

  return {
    ...options,
    allowedTools: ['mcp__pages'],
    mcpServers: { pages },
    permissionMode: 'dontAsk',
    maxTurns: 10,
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    settings: {
      autoMemoryEnabled: false,
      autoDreamEnabled: false,
      autoCompactEnabled: false,
      autoCompactWindow: 100_000,
    },
    env: {
      ...options.env,

      CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '24000',
      MAX_MCP_OUTPUT_TOKENS: '100000',
    },
  };
}
