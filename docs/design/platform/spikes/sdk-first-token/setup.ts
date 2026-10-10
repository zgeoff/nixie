// The options for nixie's assistant placement (decision 0003), the stub tools, and the prompts.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// scratch keeps every run's sessions and config out of the owner's ~/.claude. --no-thinking turns
// extended thinking off; otherwise each model keeps Claude Code's default.
export const noThinking = process.argv.includes('--no-thinking'),
  persona =
    'You are Nixie, a warm and brief personal assistant. Answer in one or two short sentences.',
  prompts = [
    'Suggest one name for a goldfish.',
    'Give me one more, a little sillier.',
    'Which of the two would a child like more?',
  ],
  scratch = mkdtempSync(join(tmpdir(), 'sdk-first-token-'));

function buildStubResult(text: string): Promise<{ content: { text: string; type: 'text' }[] }> {
  return Promise.resolve({ content: [{ text, type: 'text' }] });
}

// 3 stub tools in the shape of nixie's own. A chat prompt never needs them.
function buildServer(): ReturnType<typeof createSdkMcpServer> {
  return createSdkMcpServer({
    name: 'nixie',
    tools: [
      tool(
        'memory_search',
        'Search the owner memory for entries that match a query.',
        {
          query: z.string().describe('Words to search for'),
        },
        () => buildStubResult('no entries'),
      ),
      tool(
        'reminder_create',
        'Create a reminder for the owner at a time.',
        {
          at: z.string().describe('An ISO 8601 time'),
          text: z.string().describe('What to remind the owner of'),
        },
        () => buildStubResult('created'),
      ),
      tool(
        'run_code',
        'Run a POSIX shell snippet in a throwaway sandbox.',
        {
          code: z.string().describe('The shell snippet'),
        },
        () => buildStubResult('exit 0'),
      ),
    ],
  });
}

// A fresh config folder holds no cached remote settings, as on the first start after an install.
export function buildEnv(configDir = join(scratch, 'config')): Record<string, string> {
  return {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
    CLAUDE_CONFIG_DIR: configDir,
    HOME: process.env.HOME ?? '',
    PATH: process.env.PATH ?? '',
  };
}

export function buildOptions(model: string, withTools: boolean, freshConfig = false): Options {
  const configDir = freshConfig ? mkdtempSync(join(scratch, 'config-')) : undefined,
    cwd = mkdtempSync(join(scratch, 'cwd-'));
  return {
    allowedTools: withTools
      ? ['mcp__nixie__memory_search', 'mcp__nixie__reminder_create', 'mcp__nixie__run_code']
      : [],
    cwd,
    effort: model.includes('haiku-4-5') ? undefined : 'low',
    thinking: noThinking ? { type: 'disabled' } : undefined,
    env: buildEnv(configDir),
    includePartialMessages: true,
    maxTurns: 3,
    mcpServers: withTools ? { nixie: buildServer() } : {},
    model,
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    stderr: (data) => {
      process.stderr.write(`[stderr] ${data}`);
    },
    strictMcpConfig: true,
    systemPrompt: { prompt: persona, snapshot: false, type: 'custom' },
    tools: [],
  };
}
