// Runs the cases owner.ts leaves out and shows when Claude reads the owner message.
// Usage: bun --env-file=../../.env cases.ts <text|slow-tool|defer|interrupt> [--human]
import { randomUUID } from 'node:crypto';
import { on } from 'node:events';
import { resolve } from 'node:path';
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

type CaseName = 'defer' | 'interrupt' | 'slow-tool' | 'text';

interface Extra {
  origin?: { kind: 'human' };
  priority?: 'later' | 'next' | 'now';
  shouldQuery?: boolean;
}

const aborter = new AbortController(),
  inbox = new EventTarget(),
  incoming = on(inbox, 'message', { signal: aborter.signal }),
  ownerUuid = randomUUID(),
  started = Date.now(),
  state = { ownerRead: false, ownerSent: false, resultsAfterRead: 0, results: 0, streamed: 0 };

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 150);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

function sendText(content: string, extra: Extra & { uuid?: string } = {}): void {
  const message: SDKUserMessage = {
    message: { content, role: 'user' },
    parent_tool_use_id: null,
    type: 'user',
    ...extra,
  };
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

function sendOwner(extra: Extra): void {
  printLine(`OWNER SENDS ${formatShort(extra)} after ${state.streamed} streamed chars`);
  sendText('Owner message: include the word PINEAPPLE in your very next reply, then carry on.', {
    ...extra,
    uuid: ownerUuid,
  });
}

// An in-process MCP tool that blocks for the number of seconds it is given.
function buildSlowServer(): ReturnType<typeof createSdkMcpServer> {
  return createSdkMcpServer({
    alwaysLoad: true,
    name: 'spike',
    tools: [
      tool(
        'slow_wait',
        'Waits the given number of seconds.',
        { seconds: z.number() },
        async (args) => {
          await Bun.sleep(args.seconds * 1000);
          return { content: [{ text: `waited ${args.seconds} s`, type: 'text' }] };
        },
      ),
    ],
    version: '0.0.0',
  });
}

function buildOptions(name: CaseName): Options {
  const tools: Partial<Record<CaseName, string[]>> = {
    interrupt: ['Bash'],
    'slow-tool': ['mcp__spike__slow_wait'],
  };
  return {
    allowedTools: tools[name] ?? [],
    cwd: resolve(import.meta.dir),
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      HOME: process.env.HOME ?? '',
      PATH: process.env.PATH ?? '',
    },
    includePartialMessages: name === 'text',
    maxTurns: 12,
    ...(name === 'slow-tool' && { mcpServers: { spike: buildSlowServer() } }),
    model: 'claude-haiku-4-5-20251001',
    permissionMode: 'default',
    permissionPrompts: 'none',
    settingSources: [],
    tools: tools[name] ?? [],
  };
}

function buildTask(name: CaseName): string {
  const tasks: Record<CaseName, string> = {
    defer: 'Reply with just the word OK.',
    interrupt:
      'Run these four shell commands with the Bash tool, one tool call per command, one after ' +
      'another (never in parallel): `sleep 20 && echo step-1`, `sleep 20 && echo step-2`, ' +
      '`sleep 20 && echo step-3`, `sleep 20 && echo step-4`. Then reply DONE.',
    'slow-tool': 'Call the slow_wait tool once with seconds set to 20. Then reply DONE.',
    text: 'Write a story of about 600 words about a lighthouse keeper. Use no tools.',
  };
  return tasks[name];
}

// Claude Code stamps the owner message's uuid on the first assistant message that reads it.
function checkOwnerRead(uuids: (string | undefined)[]): void {
  if (!state.ownerRead && uuids.includes(ownerUuid)) {
    state.ownerRead = true;
    printLine('OWNER MESSAGE CONSUMED by this assistant message');
  }
}

function printAssistant(message: SDKMessage): boolean {
  if (message.type !== 'assistant') {
    return false;
  }
  checkOwnerRead([...(message.user_message_uuids ?? []), message.user_message_uuid]);
  for (const block of message.message.content) {
    if (block.type === 'text') {
      printLine(`assistant (${block.text.length} chars) ${formatShort(block.text.slice(0, 90))}`);
      printLine(`  ...ends ${formatShort(block.text.slice(-60))}`);
    } else if (block.type === 'tool_use') {
      printLine(`tool_use ${block.name} ${formatShort(block.input)}`);
    }
  }
  return message.message.content.some((block) => block.type === 'tool_use');
}

function printResult(message: SDKMessage): void {
  if (message.type !== 'result') {
    return;
  }
  const text = message.subtype === 'success' ? message.result : '';
  state.results += 1;
  state.resultsAfterRead += state.ownerRead ? 1 : 0;
  printLine(
    `result #${state.results} ${message.subtype} stop_reason=${message.stop_reason} ${formatShort(text.slice(0, 120))}`,
  );
}

function printOther(message: SDKMessage): void {
  if (message.type === 'user' && Array.isArray(message.message.content)) {
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

// Counts streamed text and reports the first delta of each streamed message.
function countStream(message: SDKMessage): boolean {
  if (message.type !== 'stream_event') {
    return false;
  }
  const event = message.event;
  if (event.type === 'message_start') {
    printLine('stream message_start');
  } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    state.streamed += event.delta.text.length;
    return true;
  }
  return false;
}

function sendOwnerSoon(extra: Extra): void {
  if (!state.ownerSent) {
    state.ownerSent = true;
    setTimeout(sendOwner, 1500, extra);
  }
}

// Case: a now message while the model streams a long text reply with no tool running.
async function runText(session: Query, human: boolean): Promise<void> {
  const extra: Extra = { priority: 'now', ...(human && { origin: { kind: 'human' } }) };
  for await (const message of session) {
    if (countStream(message)) {
      sendOwnerSoon(extra);
    }
    printAssistant(message);
    printResult(message);
    if (state.ownerRead && state.resultsAfterRead > 0) {
      return;
    }
  }
}

// Case: a now message from a human during a slow in-process MCP tool call.
async function runSlowTool(session: Query): Promise<void> {
  for await (const message of session) {
    if (printAssistant(message)) {
      sendOwnerSoon({ origin: { kind: 'human' }, priority: 'now' });
    }
    printResult(message);
    printOther(message);
    if (state.ownerRead && state.resultsAfterRead > 0 && message.type === 'result') {
      return;
    }
  }
}

// Case: a shouldQuery false message after a turn ends, then a normal message that asks about it.
async function runDefer(session: Query): Promise<void> {
  for await (const message of session) {
    printAssistant(message);
    printResult(message);
    if (message.type === 'result' && state.results === 1) {
      printLine('OWNER SENDS shouldQuery=false "the secret word is PINEAPPLE"');
      sendText('Owner note: the secret word is PINEAPPLE.', {
        shouldQuery: false,
        uuid: ownerUuid,
      });
      setTimeout(() => {
        printLine('HOST SENDS "What is the secret word?"');
        sendText('What is the secret word, if anyone told you one? Reply with only the word.');
      }, 8000);
    }
    if (message.type === 'result' && state.results === 2) {
      return;
    }
  }
}

// Case: a queued next message, then interrupt() while the first command runs.
async function runInterrupt(session: Query): Promise<void> {
  for await (const message of session) {
    if (printAssistant(message) && !state.ownerSent) {
      sendOwnerSoon({ priority: 'next' });
      setTimeout(async () => {
        printLine('HOST CALLS interrupt()');
        const receipt = await session.interrupt();
        printLine(`interrupt receipt ${formatShort(receipt)} owner=${ownerUuid.slice(0, 8)}`);
      }, 3000);
    }
    printResult(message);
    printOther(message);
    if (state.ownerRead && state.resultsAfterRead > 0) {
      return;
    }
  }
}

async function run(): Promise<void> {
  const [name, ...flags] = process.argv.slice(2) as [CaseName, ...string[]],
    runners: Record<CaseName, () => Promise<void>> = {
      defer: () => runDefer(session),
      interrupt: () => runInterrupt(session),
      'slow-tool': () => runSlowTool(session),
      text: () => runText(session, flags.includes('--human')),
    },
    session = query({ options: buildOptions(name), prompt: readInput() }),
    timer = setTimeout(() => {
      printLine('giving up after 120 s');
      aborter.abort();
      session.close();
    }, 120_000);
  sendText(buildTask(name));
  await runners[name]();
  clearTimeout(timer);
  aborter.abort();
  session.close();
  printLine('done');
}

await run();
