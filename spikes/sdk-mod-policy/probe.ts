// Probes whether a policy mod is loaded, before and after a hook wedges the hooks worker.
// Usage: bun --no-env-file probe.ts <mod-dir>
import { on } from 'node:events';
import { resolve } from 'node:path';
import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

// The input stream stays open until the host aborts it, so commands can follow the task.
const aborter = new AbortController(),
  inbox = new EventTarget(),
  incoming = on(inbox, 'message', { signal: aborter.signal }),
  started = Date.now(),
  steps = [
    '/nixie-alive',
    'Run these two shell commands with the Bash tool, one tool call each, one after the other: ' +
      '`echo first MARK_BLOCK`, then `echo second MARK_DENY`. Quote each result.',
    '/nixie-alive',
  ];

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 200);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
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

function sendNextStep(): boolean {
  const text = steps.shift();
  if (text === undefined) {
    return false;
  }
  printLine(`host sends ${formatShort(text)}`);
  inbox.dispatchEvent(
    new CustomEvent('message', {
      detail: { message: { content: text, role: 'user' }, parent_tool_use_id: null, type: 'user' },
    }),
  );
  return true;
}

function startSession(args: string[]): Query {
  const [modDir] = args;
  if (!modDir) {
    throw new Error('usage: probe.ts <mod-dir>');
  }
  return query({
    options: {
      allowedTools: ['Bash'],
      cwd: resolve(import.meta.dir),
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        HOME: process.env.HOME ?? '',
        PATH: process.env.PATH ?? '',
      },
      maxTurns: 8,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      plugins: [{ path: resolve(modDir), type: 'local' }],
      settingSources: [],
    },
    prompt: readInput(),
  });
}

function printNixieCommands(label: string, names: string[]): void {
  printLine(
    `${label} nixie commands=${formatShort(names.filter((name) => name.includes('nixie')))}`,
  );
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
        printLine(`tool_result ${formatShort(block.content)}`);
      }
    }
  }
}

function printMessage(message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    printLine(`init plugins=${formatShort(message.plugins.map((plugin) => plugin.name))}`);
    printNixieCommands('init', message.slash_commands);
  } else if (message.type === 'system' && message.subtype === 'commands_changed') {
    printNixieCommands(
      'system commands_changed',
      message.commands.map((command) => command.name),
    );
  } else if (message.type === 'result') {
    const text = message.subtype === 'success' ? message.result : '';
    printLine(`result ${message.subtype} ${formatShort(text)}`);
  } else {
    printContent(message);
  }
}

// After the last step, show what the control requests report, then close the session.
async function checkControlRequests(session: Query): Promise<void> {
  const listing = await session.getHooksListing(),
    reload = await session.reloadPlugins();
  printLine(`getHooksListing events=${formatShort(listing.events.map((event) => event.name))}`);
  printLine(`reloadPlugins plugins=${formatShort(reload.plugins.map((plugin) => plugin.name))}`);
  aborter.abort();
  session.close();
}

async function run(): Promise<void> {
  const session = startSession(process.argv.slice(2));
  sendNextStep();
  for await (const message of session) {
    printMessage(message);
    if (message.type === 'result' && !sendNextStep()) {
      await checkControlRequests(session);
    }
  }
}

await run();
