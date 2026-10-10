// Defers a Bash call with a PreToolUse hook, then resumes the session in a later process.
// Usage: bun --no-env-file defer.ts <start|batch> <session-file>
//        bun --no-env-file defer.ts resume <session-file> <allow|deny|defer>
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  HookCallback,
  HookJSONOutput,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

type Decision = 'allow' | 'defer' | 'deny';

interface DeferArgs {
  decision: Decision;
  mode: string;
  sessionFile: string;
}

const prompts: Record<string, string> = {
    batch:
      'In one single response, make two Bash tool calls in parallel: `echo batch-one-ran` and ' +
      '`echo batch-two-ran`. Then quote both results.',
    start:
      'Run the shell command `echo deferred-call-ran` with the Bash tool once, then quote the ' +
      'result exactly.',
  },
  results = new EventTarget(),
  started = Date.now();

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 220);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

function parseArgs(argv: string[]): DeferArgs {
  const [mode, sessionFile, decision] = argv;
  if (!mode || !sessionFile) {
    throw new Error('usage: defer.ts <start|batch|resume> <session-file> [allow|deny|defer]');
  }
  if (mode !== 'resume') {
    return { decision: 'defer', mode, sessionFile };
  }
  return { decision: (decision ?? 'allow') as Decision, mode, sessionFile };
}

function createPreToolUse(decision: Decision): HookCallback {
  return function handlePreToolUse(input, toolUseId): Promise<HookJSONOutput> {
    if (input.hook_event_name === 'PreToolUse') {
      printLine(`PreToolUse ${toolUseId} ${formatShort(input.tool_input)} -> ${decision}`);
    }
    return Promise.resolve({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: `nixie owner decision: ${decision}`,
      },
    });
  };
}

// A resume sends no new prompt. The input stream stays open until the first result, because the
// hook callbacks travel over the same channel and stop working once the stream ends.
// oxlint-disable-next-line require-yield
async function* readNoPrompt(): AsyncGenerator<SDKUserMessage> {
  await once(results, 'result');
}

function printStderr(data: string): void {
  for (const line of data.trimEnd().split('\n')) {
    printLine(`stderr ${line}`);
  }
}

function startSession(args: DeferArgs): Query {
  const resuming = args.mode === 'resume';
  return query({
    options: {
      allowedTools: ['Bash'],
      cwd: resolve(import.meta.dir),
      debugFile: process.env.NIXIE_DEBUG_FILE,
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        HOME: process.env.HOME ?? '',
        PATH: process.env.PATH ?? '',
      },
      hooks: { PreToolUse: [{ hooks: [createPreToolUse(args.decision)], matcher: 'Bash' }] },
      maxTurns: 4,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      resume: resuming ? readFileSync(args.sessionFile, 'utf8').trim() : undefined,
      settingSources: [],
      stderr: printStderr,
    },
    prompt: resuming ? readNoPrompt() : (prompts[args.mode] ?? ''),
  });
}

function printContent(message: SDKMessage): void {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        printLine(`assistant ${formatShort(block.text)}`);
      } else if (block.type === 'tool_use') {
        printLine(`tool_use ${block.id} ${formatShort(block.input)}`);
      }
    }
  } else if (message.type === 'user' && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === 'tool_result') {
        const marker = block.is_error ? ' (is_error)' : '';
        printLine(`tool_result${marker} ${block.tool_use_id} ${formatShort(block.content)}`);
      }
    }
  }
}

function printResult(message: SDKMessage): void {
  if (message.type !== 'result') {
    return;
  }
  const terminal = 'terminal_reason' in message ? message.terminal_reason : '';
  printLine(
    `result ${message.subtype} stop_reason=${message.stop_reason} terminal_reason=${terminal}`,
  );
  if ('deferred_tool_use' in message && message.deferred_tool_use) {
    printLine(`deferred_tool_use ${formatShort(message.deferred_tool_use)}`);
  }
  results.dispatchEvent(new Event('result'));
}

function handleMessage(message: SDKMessage, args: DeferArgs): void {
  if (message.type === 'system' && message.subtype === 'init') {
    if (args.mode !== 'resume') {
      writeFileSync(args.sessionFile, message.session_id);
    }
    printLine('init');
  } else if (message.type === 'result') {
    printResult(message);
  } else if (message.type === 'system' && message.subtype !== 'thinking_tokens') {
    printLine(`system ${message.subtype} ${formatShort(message).slice(0, 160)}`);
  } else {
    printContent(message);
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  for await (const message of startSession(args)) {
    handleMessage(message, args);
  }
  printLine('process done');
}

await run();
