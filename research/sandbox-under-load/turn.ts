// One long turn inside the imp, with nixie's options: every built-in tool off and nixie's tools over
// HTTP MCP. It prints one JSON line per event as it happens, and the host stamps each line on
// arrival. Usage: bun turn.ts --scenario rotation|parallel. Env: SPIKE_TOOLS_URL, SPIKE_TOOLS_TOKEN,
// NIXIE_MODEL, and the broker's variables that impz exec --require broker sets.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { cli, define } from 'gunshi';
import { buildMessageEvent } from './build-message-event';
import { pickTurnExitCode } from './pick-turn-exit-code';

const prompts = {
  rotation: [
    'This is a test of a long task. Call the wait tool 8 times, one call at a time.',
    'Pass step 1 to 8 in order and seconds 4 each time, and wait for each result before the next call.',
    'Never call it twice in one message. After the 8th result, reply with one line that lists the 8 results.',
  ].join(' '),
  parallel: [
    'This is a test of parallel tool calls.',
    'First, in a single message, call wait_read_only 3 times at once, with labels a, b and c and seconds 3.',
    'Then, in a single message, call wait 3 times at once, with labels d, e and f and seconds 3.',
    'Then reply with one line that lists the 6 results.',
  ].join(' '),
} as const;

const brokerVariables = [
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
];
const started = performance.now();
const turnCommand = define({
  name: 'turn',
  description: 'Runs one spike turn inside the imp and prints its events as JSON lines',
  args: {
    scenario: {
      type: 'enum',
      choices: ['rotation', 'parallel'] as const,
      required: true,
      description: 'the turn to run',
    },
  },
  run: async (ctx) => {
    process.exitCode = await runScenario(ctx.values.scenario);
  },
});

await cli(process.argv.slice(2), turnCommand);

async function runScenario(scenario: keyof typeof prompts): Promise<number> {
  const home = mkdtempSync(join(tmpdir(), 'nixie-spike-home-'));
  const options: Options = {
    tools: [],
    allowedTools: ['mcp__nixie'],
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    includePartialMessages: true,
    maxTurns: 20,
    model: process.env.NIXIE_MODEL ?? 'claude-haiku-5-5',
    mcpServers: {
      nixie: {
        type: 'http',
        url: readEnv('SPIKE_TOOLS_URL'),
        headers: { authorization: `Bearer ${readEnv('SPIKE_TOOLS_TOKEN')}` },
        alwaysLoad: true,
      },
    },
    cwd: home,
    env: buildEnv(home),
  };
  const end = { scenario, succeeded: false, authenticationFailed: false };

  emit('query', { scenario });
  try {
    for await (const message of query({ prompt: prompts[scenario], options })) {
      writeMessage(message);
      if (message.type === 'assistant' && message.error === 'authentication_failed') {
        end.authenticationFailed = true;
      }
      if (message.type === 'result') {
        end.succeeded = message.subtype === 'success' && !message.is_error;
      }
    }
  } catch (error) {
    end.succeeded = false;
    emit('thrown', { message: error instanceof Error ? error.message : String(error) });
  }

  return pickTurnExitCode(end);
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`set ${name}`);
  }
  return value;
}

function buildEnv(homeDir: string): Record<string, string> {
  const passed = Object.fromEntries(
    brokerVariables.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );

  return {
    ...passed,
    PATH: readEnv('PATH'),
    HOME: homeDir,
    CLAUDE_CONFIG_DIR: join(homeDir, '.claude'),

    // The broker drops this header's value and sets the real token on the way out.
    CLAUDE_CODE_OAUTH_TOKEN: 'nixie-broker-placeholder',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}

function emit(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, guestMs: Math.round(performance.now() - started), ...fields }));
}

function writeMessage(message: SDKMessage): void {
  const logged = buildMessageEvent(message);
  if (logged !== null) {
    emit(logged.event, logged.fields);
  }
}
