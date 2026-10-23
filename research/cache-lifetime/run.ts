// Runs one conversation session of 8 turns through the production guest turn, with the cache
// lifetime override that the arm names, and writes runs/<arm>-<pause_seconds>s.json.
//
//   MODEL_TOKEN_FILE=<credentials_file> bun run.ts <arm> [pause_seconds]
//
// Turn 1 opens with the pinned memory, and each turn's retrieved memories go before its message, as
// the production preamble places them. Turns 1 to 6 follow each other at once, then the run waits pause_seconds, then turn 7 runs after
// the pause and turn 8 follows it at once. Every turn resumes at the last turn's boundary, as the
// conversation does, on the token use spike's invented persona, memories and messages.
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { GuestFrame, InboxMessage } from '../../libs/wire/src/index';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemMessage } from '../../libs/wire/src/index';
// @boundaries-ignore the memory module's record kinds, which the memory tools' types need
import '../../modules/memory/src/memory-record-kind';
// @boundaries-ignore a spike imports the code it measures
import { runTurn } from '../../guests/conversation/src/run-turn';
// @boundaries-ignore a spike imports the code it measures
import { renderPrompt } from '../../modules/prompts/src/render-prompt';
// @boundaries-ignore a spike imports the code it measures
import { formatMessageTime } from '../../modules/sessions/src/format-message-time';
// @boundaries-ignore a spike imports the code it measures
import { renderPinnedMemory } from '../../modules/sessions/src/render-pinned-memory';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedItems } from '../../modules/sessions/src/render-retrieved-items';
// @boundaries-ignore the token use spike's fixtures, tools and tool server, so both spikes measure one context
import { buildRoleTools } from '../turn-tokens/build-role-tools';
// @boundaries-ignore the token use spike's fixtures, tools and tool server, so both spikes measure one context
import { fixtures } from '../turn-tokens/spike-fixtures';
// @boundaries-ignore the token use spike's fixtures, tools and tool server, so both spikes measure one context
import { startToolServer } from '../turn-tokens/start-tool-server';
import type { CallUsage } from './start-count-proxy';
import { startCountProxy } from './start-count-proxy';

interface Arm {
  readonly authHeader: 'x-api-key' | 'bearer';

  // the CLI's promptCacheTtl setting, or its CLAUDE_CODE_PROMPT_CACHE_TTL variable
  readonly setting?: '5m' | '1h';
  readonly variable?: '5m' | '1h';
}

const arms: Record<string, Arm> = {
  'api-key-default': { authHeader: 'x-api-key' },
  'api-key-setting-1h': { authHeader: 'x-api-key', setting: '1h' },
  'api-key-env-1h': { authHeader: 'x-api-key', variable: '1h' },
  'bearer-default': { authHeader: 'bearer' },
  'bearer-setting-1h': { authHeader: 'bearer', setting: '1h' },
};
const model = 'claude-opus-5-5';
const effort = 'medium';
const [armName = '', pauseArg = '400'] = process.argv.slice(2);
const arm = arms[armName];
const tokenFile = process.env['MODEL_TOKEN_FILE'];

if (arm === undefined || tokenFile === undefined) {
  console.error(`usage: MODEL_TOKEN_FILE=<file> bun run.ts <${Object.keys(arms).join('|')}> [pause_seconds]`);
  process.exit(1);
}
const pauseSeconds = Number(pauseArg);
const proxy = startCountProxy(tokenFile);
const lines = { ownerName: fixtures.ownerName, defaultZone: 'Europe/Lisbon', now: new Date(fixtures.day) };

if (arm.setting !== undefined) {
  process.env['SPIKE_TTL_SETTING'] = arm.setting;
}
if (arm.variable !== undefined) {
  process.env['SPIKE_TTL_ENV'] = arm.variable;
}
const turns = await runConversation();

await proxy.stop();
await mkdir(join(import.meta.dir, 'runs'), { recursive: true });
await Bun.write(
  join(import.meta.dir, 'runs', `${armName}-${pauseSeconds}s.json`),
  `${JSON.stringify({ arm: armName, ...arm, model, effort, pauseSeconds, ranAt: new Date().toISOString(), turns }, null, 2)}\n`,
);
console.log(`${armName}: ${turns.length} turns, ${proxy.calls.length} model calls`);

interface TurnResult {
  readonly label: string;
  readonly startedAt: string;
  readonly calls: readonly CallUsage[];
  readonly error: string | null;
}

async function runConversation(): Promise<readonly TurnResult[]> {
  const home = await mkdtemp(join(tmpdir(), 'cache-lifetime-'));
  // a run's own nonce ends the system prompt, so no run reads a cache entry another run wrote
  const systemPrompt = `${renderPrompt('session', { persona: fixtures.persona, skillCatalog: null, owner: { name: lines.ownerName } }, {})}\n\nRun ${crypto.randomUUID()}.`;
  const at = formatMessageTime(lines.now, null, lines);

  // a new session opens with the pinned core in its first message, as the session opening renders it
  const opening = renderSystemMessage({
    type: 'pinned-memory',
    at,
    body: renderPinnedMemory(fixtures.coreItems, lines),
  });
  const results: TurnResult[] = [];
  let resume: { sessionID: string; messageID: string } | null = null;

  for (const [index, message] of fixtures.conversation.slice(0, 8).entries()) {
    if (index === 6 && pauseSeconds > 0) {
      console.log(`pausing ${pauseSeconds} s before turn 7`);
      // oxlint-disable-next-line no-await-in-loop -- the pause is the point of the run
      await Bun.sleep(pauseSeconds * 1000);
    }
    const retrieved = renderRetrievedItems(
      message.retrieved.map((at) => fixtures.otherItems[at]!),
      lines,
    );
    const text = [
      ...(index === 0 ? [opening] : []),
      ...(retrieved === null ? [] : [renderSystemMessage({ type: 'retrieved-memory', at, body: retrieved })]),
      `[Wed 14 Oct, ${String(9 + index).padStart(2, '0')}:00] ${message.text}`,
    ].join('\n\n');
    // oxlint-disable-next-line no-await-in-loop -- each turn resumes where the one before ended
    const result = await runGuestTurn(`turn-${index + 1}`, { home, systemPrompt, text, resume });

    results.push(result.turn);
    resume = result.boundary;
    if (resume === null) {
      break;
    }
  }
  return results;
}

// runs one turn of the production guest against the scripted tool server and the counting proxy
async function runGuestTurn(
  label: string,
  session: { home: string; systemPrompt: string; text: string; resume: { sessionID: string; messageID: string } | null },
): Promise<{ turn: TurnResult; boundary: { sessionID: string; messageID: string } | null }> {
  const server = startToolServer(buildRoleTools('conversation'), (name, input) =>
    fixtures.answerCall('conversation', name, input),
  );
  const frames: GuestFrame[] = [];
  const input: InboxMessage[] = [{ uuid: crypto.randomUUID(), text: session.text }];
  const startedAt = new Date().toISOString();
  let error: string | null = null;

  try {
    await runTurn(
      {
        type: 'turn',
        profile: {
          model,
          baseURL: `${proxy.url}/${label}`,
          effort,
          authHeader: arm!.authHeader,
          contextTokens: null,
          cacheTTL: arm!.setting ?? '5m',
        },
        tools: { url: server.config.url, token: 'unused' },
        resume: session.resume,
        systemPrompt: session.systemPrompt,
        input,
      },
      {
        env: buildGuestEnv(session.home),
        toolServer: server.config,
        messages: [],
        emit: (frame) => {
          frames.push(frame);
          return Promise.resolve();
        },
      },
    );
  } catch (thrown) {
    error = String(thrown);
  }
  await server.stop();
  await proxy.waitForCounts();

  const failed = frames.find((frame) => frame.type === 'failed');
  const last = frames.filter((frame) => frame.type === 'ended').at(-1);
  const turn: TurnResult = {
    label,
    startedAt,
    calls: proxy.calls.filter((call) => call.tag === label),
    error: error ?? (failed === undefined ? null : `${failed.reason}: ${failed.detail}`),
  };
  const sum = (pick: (call: CallUsage) => number) => turn.calls.reduce((total, call) => total + pick(call), 0);

  console.log(
    `${label}: ${turn.calls.length} calls, write 5m ${sum((call) => call.cacheWrite5m)}, write 1h ${sum((call) => call.cacheWrite1h)}, read ${sum((call) => call.cacheRead)}, ttls ${[...new Set(turn.calls.flatMap((call) => call.requestedTTLs))].join('/')}${turn.error === null ? '' : `, error ${turn.error}`}`,
  );
  return { turn, boundary: last?.boundary ?? null };
}

// the guest's own environment: its home and the placeholder credential the grant would swap
function buildGuestEnv(home: string): Record<string, string | undefined> {
  return {
    HOME: home,
    PATH: process.env['PATH'],
    [arm!.authHeader === 'bearer' ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY']: 'placeholder',
  };
}
