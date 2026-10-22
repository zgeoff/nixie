import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
// @boundaries-ignore a spike imports the code it measures
import { runTurn } from '../../guests/conversation/src/run-turn';
// @boundaries-ignore a spike imports the code it measures
import type { GuestFrame, InboxMessage, SessionPoint } from '../../libs/wire/src/index';
import { startEmptyToolServer } from './start-empty-tool-server';

// the conversation's profile in the reference deployment configuration, with the cache lifetime
// the models config gives a profile that sets none; the runs swap its credential for the
// subscription's
export const profile = {
  model: 'claude-opus-5-5',
  effort: 'medium',
  baseURL: 'https://api.anthropic.com',
  authHeader: 'x-api-key',
  contextTokens: null,
  cacheTTL: '5m',
} as const;

// Opus 5.5 list prices in dollars per million tokens; a 5-minute cache write costs 1.25 times input
const prices = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 };

export interface TurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface SpikeTurn {
  readonly reply: string;
  readonly boundary: SessionPoint | null;
  readonly usage: TurnUsage | null;
  readonly costUSD: number;
  readonly error: string | null;
}

export interface SpikeTurnRequest {
  readonly home: string;
  readonly systemPrompt: string;
  readonly input: readonly InboxMessage[];
  readonly resume: SessionPoint | null;
}

const maxAttempts = 5;
const retryDelayMs = 60_000;

// a failed turn, such as a rate-limited one, runs again after a pause, as a step retries after its
// delay; the result counts the cost of every attempt
export async function runSpikeTurnWithRetry(
  request: SpikeTurnRequest,
): Promise<SpikeTurn & { readonly attempts: number }> {
  let costUSD = 0;

  for (let attempt = 1; ; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a retry waits for the attempt before it
    const result = await runSpikeTurn(request);

    costUSD += result.costUSD;

    if (result.error === null || attempt === maxAttempts) {
      return { ...result, costUSD, attempts: attempt };
    }

    console.log(`attempt ${attempt} failed: ${result.error}`);
    // oxlint-disable-next-line no-await-in-loop -- a retry waits for the attempt before it
    await Bun.sleep(retryDelayMs);
  }
}

// runs one turn of the production conversation guest, resuming at the last turn's boundary as the
// conversation does
async function runSpikeTurn(request: SpikeTurnRequest): Promise<SpikeTurn> {
  const server = startEmptyToolServer();
  const frames: GuestFrame[] = [];
  let thrown: string | null = null;

  try {
    await runTurn(
      {
        type: 'turn',
        profile,
        tools: { url: server.config.url, token: 'unused' },
        resume: request.resume,
        systemPrompt: request.systemPrompt,
        input: request.input,
      },
      {
        env: buildGuestEnv(request.home),
        toolServer: server.config,
        messages: [],
        runQuery: (params) => query({ ...params, options: toSubscriptionOptions(params.options) }),
        emit: (frame) => {
          frames.push(frame);

          return Promise.resolve();
        },
      },
    );
  } catch (error) {
    thrown = String(error);
  } finally {
    await server.stop();
  }

  const ended = frames.filter((frame) => frame.type === 'ended');
  const failed = frames.find((frame) => frame.type === 'failed');
  const last = ended.at(-1);
  const usage = ended.length === 0 ? null : sumUsage(ended.map((frame) => frame.usage));
  const endError = last?.isError === true ? `${last.subtype}: ${last.terminalReason ?? ''}` : null;

  return {
    reply: frames.flatMap((frame) => (frame.type === 'assistant' && frame.text !== '' ? [frame.text] : [])).join('\n\n'),
    boundary: last?.boundary ?? null,
    usage,
    costUSD: usage === null ? 0 : buildCost(usage),
    error: thrown ?? (failed === undefined ? endError : `${failed.reason}: ${failed.detail}`),
  };
}

// The guest's options with one change: the CLI holds a placeholder subscription token in place of
// the profile's API key, and talks to its default endpoint, so the host's egress sends each call
// on the Claude subscription and the runs spend no API money.
function toSubscriptionOptions(options: Options | undefined): Options {
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_BASE_URL: _url, ...env } = options?.env ?? {};

  return { ...options, env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: 'placeholder' } };
}

function sumUsage(usages: readonly TurnUsage[]): TurnUsage {
  return {
    inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
    outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
    cacheReadTokens: usages.reduce((total, usage) => total + usage.cacheReadTokens, 0),
    cacheWriteTokens: usages.reduce((total, usage) => total + usage.cacheWriteTokens, 0),
  };
}

function buildCost(usage: TurnUsage): number {
  return (
    (usage.inputTokens * prices.input +
      usage.cacheWriteTokens * prices.cacheWrite +
      usage.cacheReadTokens * prices.cacheRead +
      usage.outputTokens * prices.output) /
    1_000_000
  );
}

// the guest's own environment: its home, the placeholder that the host's egress swaps for the
// credential, and the host's proxy
function buildGuestEnv(home: string): Record<string, string | undefined> {
  return {
    HOME: home,
    PATH: process.env['PATH'],
    ANTHROPIC_API_KEY: 'placeholder',
    HTTPS_PROXY: process.env['HTTPS_PROXY'],
    https_proxy: process.env['https_proxy'],
    NO_PROXY: process.env['NO_PROXY'],
    no_proxy: process.env['no_proxy'],
    NODE_USE_ENV_PROXY: process.env['NODE_USE_ENV_PROXY'],
    SSL_CERT_FILE: process.env['SSL_CERT_FILE'],
    NODE_EXTRA_CA_CERTS: process.env['NODE_EXTRA_CA_CERTS'],
  };
}
