// Runs one Agent SDK query with one mod loaded and prints a compact timeline of what happened.
// Usage: bun --no-env-file run.ts <mod-dir> <prompt-file> [--debug-file <path>]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

const started = Date.now();

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 160);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

// Pass only what the CLI needs, so the parent session's variables do not leak into the child.
function buildEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
    HOME: process.env.HOME ?? '',
    PATH: process.env.PATH ?? '',
  };
}

function printStderr(data: string): void {
  for (const line of data.trimEnd().split('\n')) {
    printLine(`stderr ${line}`);
  }
}

function printContent(message: SDKMessage): void {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        printLine(`assistant ${formatShort(block.text)}`);
      } else if (block.type === 'tool_use') {
        printLine(`tool_use ${block.name} ${formatShort(block.input)}`);
      }
    }
  } else if (message.type === 'user' && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === 'tool_result') {
        printLine(
          `tool_result${block.is_error ? ' (is_error)' : ''} ${formatShort(block.content)}`,
        );
      }
    }
  }
}

function printMessage(message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    const names = message.plugins.map((plugin) => plugin.name);
    printLine(`init cli=${message.claude_code_version} plugins=${formatShort(names)}`);
    printLine(`init plugin_errors=${formatShort(message.plugin_errors ?? [])}`);
  } else if (message.type === 'result') {
    printLine(`result ${message.subtype} stop_reason=${message.stop_reason}`);
  } else if (message.type === 'system' && message.subtype !== 'thinking_tokens') {
    printLine(`system ${message.subtype} ${formatShort(message).slice(0, 120)}`);
  } else {
    printContent(message);
  }
}

function startSession(args: string[]): Query {
  const [modDir, promptFile, flag, debugPath] = args;
  if (!modDir || !promptFile) {
    throw new Error('usage: run.ts <mod-dir> <prompt-file> [--debug-file <path>]');
  }
  return query({
    options: {
      allowedTools: ['Bash', 'Read'],
      cwd: resolve(import.meta.dir),
      debugFile: flag === '--debug-file' ? debugPath : undefined,
      env: buildEnv(),
      maxTurns: 8,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      plugins: [{ path: resolve(modDir), type: 'local' }],
      settingSources: [],
      stderr: printStderr,
    },
    prompt: readFileSync(promptFile, 'utf8'),
  });
}

async function run(): Promise<void> {
  for await (const message of startSession(process.argv.slice(2))) {
    printMessage(message);
  }
}

await run();
