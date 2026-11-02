import { expect, test } from 'bun:test';
import { buildOverflowOptions } from './build-overflow-options';

test('it runs up to 10 steps with the page tool, auto-compaction off and a 24,000-token blocking limit', () => {
  expect(
    buildOverflowOptions({ directory: '/srv/probe', env: { CLAUDE_CONFIG_DIR: '/srv/probe' } }),
  ).toStrictEqual({
    cwd: '/srv/probe',
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    allowedTools: ['mcp__pages'],
    mcpServers: { pages: expect.objectContaining({ type: 'sdk', name: 'pages' }) },
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
      CLAUDE_CONFIG_DIR: '/srv/probe',
      CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '24000',
      MAX_MCP_OUTPUT_TOKENS: '100000',
    },
  });
});
