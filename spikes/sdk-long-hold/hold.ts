// Runs one Agent SDK query whose Bash call a hold mod pauses, and plays the owner who answers late.
// Usage: bun --env-file=../../.env hold.ts <mod-dir> <delay-s> <port> [--poll] [--debug-file <path>]
import { resolve } from 'node:path';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

interface HoldArgs {
  debugFile: string | undefined;
  modDir: string;
  ownerDelayMs: number;
  poll: boolean;
  port: number;
}

const owner = { decidedAt: 0 },
  started = Date.now();

function formatElapsed(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7);
}

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 200);
}

function printLine(text: string): void {
  console.log(`${formatElapsed()} ${text}`);
}

function parseArgs(argv: string[]): HoldArgs {
  const [modDir, delay, port, ...flags] = argv;
  if (!modDir || !delay || !port) {
    throw new Error('usage: hold.ts <mod-dir> <delay-s> <port> [--poll] [--debug-file <path>]');
  }
  return {
    debugFile: flags.includes('--debug-file')
      ? flags[flags.indexOf('--debug-file') + 1]
      : undefined,
    modDir,
    ownerDelayMs: Number(delay) * 1000,
    poll: flags.includes('--poll'),
    port: Number(port),
  };
}

// The owner refuses once the delay has passed since the first ask. With --poll, a request answers
// `pending` after at most 20 s, so each long-poll stays under the 30 s cap on $.http.fetch.
async function handleOwnerRequest(request: Request, args: HoldArgs): Promise<Response> {
  printLine(`owner asked ${new URL(request.url).pathname}`);
  owner.decidedAt ||= Date.now() + args.ownerDelayMs;
  if (args.poll && owner.decidedAt - Date.now() > 20_000) {
    await Bun.sleep(20_000);
    return Response.json({ decision: 'pending' });
  }
  await Bun.sleep(Math.max(owner.decidedAt - Date.now(), 0));
  printLine('owner answers deny');
  return Response.json({ decision: 'deny' });
}

function printStderr(data: string): void {
  for (const line of data.trimEnd().split('\n')) {
    printLine(`stderr ${line}`);
  }
}

function startSession(args: HoldArgs): Query {
  return query({
    options: {
      allowedTools: ['Bash'],
      cwd: resolve(import.meta.dir),
      debugFile: args.debugFile,
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
        HOME: process.env.HOME ?? '',
        NIXIE_DECIDER_URL: `http://127.0.0.1:${args.port}`,
        PATH: process.env.PATH ?? '',
      },
      maxTurns: 4,
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      plugins: [{ path: resolve(args.modDir), type: 'local' }],
      settingSources: [],
      stderr: printStderr,
    },
    prompt:
      'Run the shell command `echo held MARK_HOLD` with the Bash tool once, then quote the tool ' +
      'result exactly. Do not retry it.',
  });
}

function printContent(message: SDKMessage): void {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
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
    printLine(`init session=${message.session_id}`);
  } else if (message.type === 'result') {
    printLine(`result ${message.subtype} stop_reason=${message.stop_reason}`);
  } else {
    printContent(message);
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)),
    server = Bun.serve({
      fetch: (request) => handleOwnerRequest(request, args),
      hostname: '127.0.0.1',
      idleTimeout: 0,
      port: args.port,
    });
  try {
    for await (const message of startSession(args)) {
      printMessage(message);
    }
  } finally {
    // A held request may still sleep in the owner service, so stop without waiting for it.
    void server.stop(true);
  }
  process.exit(0);
}

await run();
