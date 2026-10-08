// Chats with the model in the terminal under a persona file, one session at a time.
// Usage: env -u ANTHROPIC_API_KEY bun --env-file=../../.env chat.ts [--persona <file>]
//   [--mode replace|append] [--model <id>] [--profile <name>] [--tools <A,B>]
import { randomUUID } from 'node:crypto';
import { on, once } from 'node:events';
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Interface } from 'node:readline/promises';
import { createInterface } from 'node:readline/promises';
import type {
  Query,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Settings } from './options.ts';
import { buildOptions, parseArgs } from './options.ts';

interface Session {
  aborter: AbortController;
  done: Promise<void>;
  events: EventTarget;
  query: Query;
  transcript: string;
}

interface Chat {
  session: Session;
  settings: Settings;
  stop: AbortController;
  terminal: Interface;
}

const HELP = `commands:
    /restart              reload the persona file and start a new session
    /persona <file>       switch the persona file and restart
    /mode replace|append  switch the system prompt mode and restart
    /model <id>           switch the model and restart
    /quit                 end the chat (Ctrl-D works too)`,
  here = import.meta.dir;

function writeTranscript(session: Session, text: string): void {
  appendFileSync(session.transcript, `${text}\n\n`);
}

async function* readInput(session: Session): AsyncGenerator<SDKUserMessage> {
  try {
    for await (const [event] of on(session.events, 'input', { signal: session.aborter.signal })) {
      yield (event as CustomEvent<SDKUserMessage>).detail;
    }
  } catch (error) {
    if (!session.aborter.signal.aborted) {
      throw error;
    }
  }
}

function emitTurnDone(session: Session): void {
  session.events.dispatchEvent(new Event('turn-done'));
}

function printAssistant(session: Session, message: SDKAssistantMessage): void {
  const text = message.message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(''),
    tools = message.message.content.flatMap((block) =>
      block.type === 'tool_use' ? [`${block.name} ${JSON.stringify(block.input)}`] : [],
    );
  for (const tool of tools) {
    console.log(`\n[tool ${tool.slice(0, 200)}]`);
    writeTranscript(session, `> tool: ${tool}`);
  }
  if (text) {
    writeTranscript(session, `**model:** ${text}`);
  }
}

function printResult(session: Session, message: SDKResultMessage): void {
  const cost = message.total_cost_usd ? ` cost=$${message.total_cost_usd.toFixed(4)}` : '',
    failed = message.subtype !== 'success' || message.is_error;
  console.log(`\n[turn done${failed ? ` ${message.subtype}` : ''}${cost}]`);
  if (failed && message.subtype === 'success') {
    console.log(`[error ${message.result}]`);
    writeTranscript(session, `> error: ${message.result}`);
  }
  emitTurnDone(session);
}

function printMessage(session: Session, message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log(
      `[session cli=${message.claude_code_version} model=${message.model} tools=${JSON.stringify(message.tools)}]`,
    );
  } else if (message.type === 'assistant') {
    printAssistant(session, message);
  } else if (message.type === 'result') {
    printResult(session, message);
  } else if (
    message.type === 'stream_event' &&
    message.event.type === 'content_block_delta' &&
    message.event.delta.type === 'text_delta'
  ) {
    process.stdout.write(message.event.delta.text);
  }
}

async function readSession(session: Session): Promise<void> {
  for await (const message of session.query) {
    printMessage(session, message);
  }
  emitTurnDone(session);
}

interface Header {
  model: string | undefined;
  persona: string;
  settings: Settings;
}

function writeHeader(session: Session, header: Header): void {
  const lines = [
    `# model-eval ${new Date().toISOString()}`,
    `model=${header.model} mode=${header.settings.mode} profile=${header.settings.profile ?? '(subscription)'}`,
    `tools=${JSON.stringify(header.settings.tools)} persona=${header.settings.persona}`,
    `## persona\n\n${header.persona.trim()}\n\n## conversation`,
  ];
  writeTranscript(session, lines.join('\n\n'));
  console.log(`[${lines[1]} persona=${header.settings.persona}]`);
  console.log(`[transcript ${session.transcript}]`);
}

function startSession(settings: Settings, persona: string): Session {
  const options = buildOptions(settings, persona),
    session = {
      aborter: new AbortController(),
      events: new EventTarget(),
      transcript: join(here, 'transcripts', `${new Date().toISOString().replaceAll(':', '-')}.md`),
    } as Session;
  mkdirSync(join(here, 'transcripts'), { recursive: true });
  session.query = query({ options, prompt: readInput(session) });
  session.done = readSession(session);
  writeHeader(session, { model: options.model, persona, settings });
  return session;
}

// Reads the persona file fresh, so an edit takes effect on the next restart.
function createSession(settings: Settings): Session {
  return startSession(settings, readFileSync(settings.persona, 'utf8'));
}

async function removeSession(session: Session): Promise<void> {
  session.aborter.abort();
  session.query.close();
  await session.done.catch(() => null);
}

async function sendTurn(session: Session, text: string): Promise<void> {
  const message: SDKUserMessage = {
      message: { content: text, role: 'user' },
      parent_tool_use_id: null,
      type: 'user',
      uuid: randomUUID(),
    },
    turnDone = once(session.events, 'turn-done');
  writeTranscript(session, `**owner:** ${text}`);
  session.events.dispatchEvent(new CustomEvent('input', { detail: message }));
  await turnDone;
}

function buildChanges(value: string | undefined): Record<string, Partial<Settings> | null> {
  return {
    '/mode': value === 'replace' || value === 'append' ? { mode: value } : null,
    '/model': value ? { model: value } : null,
    '/persona': value ? { persona: resolve(value) } : null,
    '/restart': {},
  };
}

// Returns the new settings when a command needs a restart, or null when it does not.
function applyCommand(settings: Settings, line: string): Settings | null {
  const [command, value] = line.split(/\s+/u, 2),
    change = buildChanges(value)[command ?? ''];
  if (!change) {
    console.log(HELP);
    return null;
  }
  return { ...settings, ...change };
}

async function runLine(chat: Chat, line: string): Promise<void> {
  if (!line.startsWith('/')) {
    await sendTurn(chat.session, line);
    return;
  }
  const next = applyCommand(chat.settings, line);
  if (next) {
    await resetSession(chat, next);
  }
}

// Starts the new session first, so a bad persona path or profile keeps the old one running.
async function resetSession(chat: Chat, next: Settings): Promise<void> {
  try {
    const session = createSession(next);
    await removeSession(chat.session);
    chat.session = session;
    chat.settings = next;
  } catch (error) {
    console.log(`[restart failed, old session kept: ${(error as Error).message}]`);
  }
}

// Reads one line, handles it, then calls itself, so only one turn runs at a time.
async function runLoop(chat: Chat): Promise<void> {
  const line = await chat.terminal.question('\nyou> ', { signal: chat.stop.signal }),
    text = line.trim();
  if (text === '/quit') {
    return;
  }
  if (text) {
    await runLine(chat, text);
  }
  await runLoop(chat);
}

async function run(settings: Settings): Promise<void> {
  const chat: Chat = {
    session: createSession(settings),
    settings,
    stop: new AbortController(),
    terminal: createInterface({ input: process.stdin, output: process.stdout }),
  };

  // Ctrl-C or Ctrl-D closes the terminal, which ends any running turn and the pending question.
  chat.terminal
    .on('SIGINT', () => chat.terminal.close())
    .on('close', () => {
      chat.stop.abort();
      chat.session.query.close();
    });
  console.log('[type /help for commands]');
  try {
    await runLoop(chat);
  } catch (error) {
    if (!chat.stop.signal.aborted) {
      throw error;
    }
  } finally {
    chat.terminal.close();
    await removeSession(chat.session);
    rmSync(chat.settings.cwd, { force: true, recursive: true });
  }
}

await run(parseArgs(process.argv.slice(2)));
