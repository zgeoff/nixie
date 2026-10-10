// Option A: the SDK on the host, with nixie's tools in an in-process SDK MCP server.
// Usage: env -u ANTHROPIC_API_KEY bun --no-env-file host-a.ts (run.sh sets the rest)
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { runSession } from './session.ts';
import { runTool, toolSpecs } from './tools.ts';

const nixie = createSdkMcpServer({
  alwaysLoad: true,
  name: 'nixie',
  tools: toolSpecs.map((spec) =>
    tool(spec.name, spec.description, spec.shape, (input) => Promise.resolve(runTool(spec, input))),
  ),
  version: '0.0.0',
});

// Pass only what the CLI needs, so the parent session's variables do not leak into the child.
await runSession(nixie, {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
  HOME: process.env.HOME ?? '',
  PATH: process.env.PATH ?? '',
});
