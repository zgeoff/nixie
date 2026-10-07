// Sends an owner message into a running task with one priority and shows when Claude reads it.
// Usage: bun --env-file=../../.env owner.ts <now|next|later|none> [--human] [--step <seconds>]
import { randomUUID } from 'node:crypto';
import { on } from 'node:events';
import { resolve } from 'node:path';
import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

type Priority = 'later' | 'next' | 'now';

interface OwnerArgs {
  human: boolean;
  priority: Priority | undefined;
  step: number;
}

// The input stream stays open until the host aborts it, so the owner can speak mid-task.
const aborter = new AbortController(),
  inbox = new EventTarget(),
  incoming = on(inbox, 'message', { signal: aborter.signal }),
  ownerUuid = randomUUID(),
  started = Date.now(),
  state = { ownerRead: false, ownerSent: false, results: 0, sawDone: false };

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 150);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

function parseArgs(argv: string[]): OwnerArgs {
  const [priority, ...flags] = argv;
  if (!priority) {
    throw new Error('usage: owner.ts <now|next|later|none> [--human] [--step <seconds>]');
  }
  return {
    human: flags.includes('--human'),
    priority: priority === 'none' ? undefined : (priority as Priority),
    step: flags.includes('--step') ? Number(flags[flags.indexOf('--step') + 1]) : 5,
  };
}

function sendMessage(message: SDKUserMessage): void {
  inbox.dispatchEvent(new CustomEvent('message', { detail: message }));
}

async function* readInput(): AsyncGenerator<SDKUserMessage> {
  try {
    for await (const [event] of incoming) {
      yield (event as CustomEvent<SDKUserMessage>).detail;
    }
  } catch (error) {
    if (!aborter.signal.aborted) {
      throw error;
    }
  }
}

function sendTask(step: number): void {
  const commands = [1, 2, 3, 4].map((n) => `\`sleep ${step} && echo step-${n}\``).join(', ');
  sendMessage({
    message: {
      content:
        'Run these four shell commands with the Bash tool, one tool call per command, one after ' +
        `another (never in parallel): ${commands}. Then reply DONE.`,
      role: 'user',
    },
    parent_tool_use_id: null,
    type: 'user',
  });
}

function sendOwner(args: OwnerArgs): void {
  printLine(`OWNER SENDS priority=${args.priority ?? '(none)'} human=${args.human}`);
  sendMessage({
    message: {
      content: 'Owner message: include the word PINEAPPLE in your very next reply, then carry on.',
      role: 'user',
    },
    parent_tool_use_id: null,
    type: 'user',
    uuid: ownerUuid,
    ...(args.priority && { priority: args.priority }),
    ...(args.human && { origin: { kind: 'human' as const } }),
  });
}

function startSession(): Query {
  return query({
    options: {
      allowedTools: ['Bash'],
      cwd: resolve(import.meta.dir),
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        HOME: process.env.HOME ?? '',
        PATH: process.env.PATH ?? '',
      },
      maxTurns: 12,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      settingSources: [],
    },
    prompt: readInput(),
  });
}

// Claude Code stamps the owner message's uuid on the first assistant message that reads it.
function checkOwnerRead(uuids: (string | undefined)[]): void {
  if (!state.ownerRead && uuids.includes(ownerUuid)) {
    state.ownerRead = true;
    printLine('OWNER MESSAGE CONSUMED by this assistant message');
  }
}

function handleAssistant(message: SDKMessage, args: OwnerArgs): void {
  if (message.type !== 'assistant') {
    return;
  }
  checkOwnerRead([...(message.user_message_uuids ?? []), message.user_message_uuid]);
  for (const block of message.message.content) {
    if (block.type === 'text') {
      printLine(`assistant ${formatShort(block.text)}`);
    } else if (block.type === 'tool_use') {
      printLine(`tool_use ${formatShort(block.input)}`);
    }
  }
  if (!state.ownerSent && message.message.content.some((block) => block.type === 'tool_use')) {
    state.ownerSent = true;
    setTimeout(sendOwner, 1500, args);
  }
}

function handleResult(message: SDKMessage): void {
  if (message.type !== 'result') {
    return;
  }
  const text = message.subtype === 'success' ? message.result : '';
  state.results += 1;
  printLine(
    `result #${state.results} ${message.subtype} stop_reason=${message.stop_reason} ${formatShort(text)}`,
  );
  state.sawDone ||= text.includes('DONE');
  if (state.ownerRead && state.sawDone) {
    aborter.abort();
  }
}

function handleMessage(message: SDKMessage, args: OwnerArgs): void {
  if (message.type === 'assistant') {
    handleAssistant(message, args);
  } else if (message.type === 'result') {
    handleResult(message);
  } else if (message.type === 'user' && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === 'tool_result') {
        printLine(
          `tool_result${block.is_error ? ' (is_error)' : ''} ${formatShort(block.content)}`,
        );
      }
    }
  } else if (message.type === 'system' && message.subtype.startsWith('task')) {
    printLine(`system ${message.subtype} ${formatShort(message).slice(0, 140)}`);
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)),
    session = startSession(),
    timer = setTimeout(() => {
      printLine('giving up after 150 s');
      aborter.abort();
      session.close();
    }, 150_000);
  sendTask(args.step);
  for await (const message of session) {
    handleMessage(message, args);
  }
  clearTimeout(timer);
  printLine('done');
}

await run();
