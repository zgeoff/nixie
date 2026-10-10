// Resumes a session in a new process with a follow-up prompt and prints what Claude sees.
// Usage: bun --no-env-file resume.ts <session-id> <prompt>
import { resolve } from 'node:path';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

const started = Date.now();

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 220);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

function startSession(args: string[]): Query {
  const [sessionId, prompt] = args;
  if (!sessionId || !prompt) {
    throw new Error('usage: resume.ts <session-id> <prompt>');
  }
  return query({
    options: {
      allowedTools: [],
      cwd: resolve(import.meta.dir),
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        HOME: process.env.HOME ?? '',
        PATH: process.env.PATH ?? '',
      },
      maxTurns: 4,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      resume: sessionId,
      settingSources: [],
    },
    prompt,
  });
}

function printMessage(message: SDKMessage): void {
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
        printLine(`tool_result ${formatShort(block.content)}`);
      }
    }
  } else if (message.type === 'result') {
    printLine(`result ${message.subtype} stop_reason=${message.stop_reason}`);
  }
}

async function run(): Promise<void> {
  for await (const message of startSession(process.argv.slice(2))) {
    printMessage(message);
  }
}

await run();
