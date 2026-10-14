// Checks whether `decision: 'block'` from a PreCompact hook stops an automatic compaction.
// Usage: bun --no-env-file precompact-block.ts <config-dir>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HookCallbackMatcher, SyncHookJSONOutput, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

const configDir = process.argv.at(2),
  cwd = resolve(import.meta.dir),
  budgetUSD = 3;

if (!configDir) {
  throw new Error('usage: precompact-block.ts <config-dir>');
}

let spentUSD = 0;

interface HookCall {
  event: string;
  trigger: string;
  output: SyncHookJSONOutput;
}

interface Fork {
  label: string;
  prompt: string;
  preCompact: SyncHookJSONOutput | undefined;

  // true sets the auto-compact window low enough that the seeded context passes it
  lowWindow: boolean;
}

interface Resume {
  sessionID: string;
  fork: boolean;
}

interface TurnResult {
  answer: string;
  boundaries: string[];
  costUSD: number;
  hookCalls: HookCall[];
  inputTokens: number;
  result: string;
  sessionID: string | undefined;
  statuses: string[];
}

const ask = 'List the code word from each part of the tide notes, in order, comma-separated. Nothing else.';

// A compaction needs several turns to summarise: one 104k-token message fails with too_few_groups.
// The seed builds 5 turns of about 21k tokens each under the default window, so none compacts.
const seedTurns = ['HERON', 'MAPLE', 'COBALT', 'FERN', 'QUARTZ'];
let seedID: string | undefined;
for (const [index, word] of seedTurns.entries()) {
  const label = `seed ${index + 1}`;
  const turn = await runTurn(
    { label, prompt: buildFiller(760, `Part ${index + 1}. The code word is ${word}.`), preCompact: undefined, lowWindow: false },
    seedID === undefined ? undefined : { sessionID: seedID, fork: false },
  );
  printTurn(label, turn);
  seedID = turn.sessionID;
}
if (seedID === undefined) {
  throw new Error('the seed returned no session');
}

const forks: Fork[] = [
  { label: 'A control, no hook', prompt: ask, preCompact: undefined, lowWindow: true },
  { label: 'B hook returns {}', prompt: ask, preCompact: {}, lowWindow: true },
  {
    label: 'C hook returns block',
    prompt: ask,
    preCompact: { decision: 'block', reason: 'nixie compacts the session itself' },
    lowWindow: true,
  },
];
let blocked: TurnResult | undefined;
for (const fork of forks) {
  const result = await runTurn(fork, { sessionID: seedID, fork: true });
  printTurn(fork.label, result);
  printTranscript(fork.label, result.sessionID);
  if (fork.preCompact?.decision === 'block') {
    blocked = result;
  }
}

// D: the blocked session grows past the model's 200k-token window, so the API itself refuses
if (blocked?.sessionID !== undefined) {
  const overflow: Fork = {
    label: 'D block, past the window',
    prompt: buildFiller(3700, 'The second code word is OTTER.'),
    preCompact: { decision: 'block', reason: 'nixie compacts the session itself' },
    lowWindow: true,
  };
  const result = await runTurn(overflow, { sessionID: blocked.sessionID, fork: true });
  printTurn(overflow.label, result);
  printTranscript(overflow.label, result.sessionID);
}
console.log(`total cost $${spentUSD.toFixed(3)}`);

async function runTurn(fork: Fork, resume: Resume | undefined): Promise<TurnResult> {
  if (spentUSD > budgetUSD) {
    throw new Error(`spent $${spentUSD.toFixed(3)}, over the run's budget`);
  }
  const turn: TurnResult = {
    answer: '',
    boundaries: [],
    costUSD: 0,
    hookCalls: [],
    inputTokens: 0,
    result: '',
    sessionID: undefined,
    statuses: [],
  };
  try {
    for await (const message of query({
      options: buildOptions(fork, resume, turn.hookCalls),
      prompt: fork.prompt,
    })) {
      collectMessage(turn, message);
    }
  } catch (error) {
    turn.result += ` threw: ${String(error).slice(0, 200)}`;
  }
  spentUSD += turn.costUSD;
  return turn;
}

function buildOptions(fork: Fork, resume: Resume | undefined, hookCalls: HookCall[]): Options {
  return {
    cwd,
    env: {
      ...(fork.lowWindow ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' } : {}),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      CLAUDE_CONFIG_DIR: configDir ?? '',
      HOME: process.env.HOME ?? '',
      PATH: process.env.PATH ?? '',
    },
    hooks: buildHooks(fork.preCompact, hookCalls),
    maxTurns: 1,
    model: 'claude-haiku-4-5-20251001',
    settingSources: [],
    tools: [],
    ...(resume === undefined ? {} : { forkSession: resume.fork, resume: resume.sessionID }),
  };
}

// PostCompact is always recorded, so a compaction that ran shows up even when nothing blocks it
function buildHooks(preCompact: SyncHookJSONOutput | undefined, hookCalls: HookCall[]): Options['hooks'] {
  const post: HookCallbackMatcher = {
    hooks: [
      async (input) => {
        hookCalls.push({ event: input.hook_event_name, trigger: 'trigger' in input ? String(input.trigger) : '', output: {} });
        return {};
      },
    ],
  };
  if (preCompact === undefined) {
    return { PostCompact: [post] };
  }
  const pre: HookCallbackMatcher = {
    hooks: [
      async (input) => {
        hookCalls.push({
          event: input.hook_event_name,
          trigger: 'trigger' in input ? String(input.trigger) : '',
          output: preCompact,
        });
        return preCompact;
      },
    ],
  };
  return { PostCompact: [post], PreCompact: [pre] };
}

function collectMessage(turn: TurnResult, message: SDKMessage): void {
  if ('session_id' in message && message.session_id) {
    turn.sessionID = message.session_id;
  }
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        turn.answer += block.text;
      }
    }
  } else if (message.type === 'system' && message.subtype === 'compact_boundary') {
    const { compact_metadata: meta } = message;
    turn.boundaries.push(`${meta.trigger} pre=${meta.pre_tokens} post=${meta.post_tokens ?? '?'}`);
  } else if (message.type === 'system' && message.subtype === 'status') {
    const detail = [message.compact_result, message.compact_error].filter(Boolean).join(' ');
    turn.statuses.push(`${message.status ?? 'null'}${detail ? ` (${detail})` : ''}`);
  } else if (message.type === 'result') {
    const { usage } = message;
    turn.costUSD = message.total_cost_usd;
    turn.inputTokens = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
    turn.result = `${message.subtype} is_error=${message.is_error}`;
    if (message.subtype === 'success') {
      turn.result += message.is_error ? ` "${message.result.slice(0, 160)}"` : '';
    } else {
      turn.result += ` ${message.errors.join('; ').slice(0, 160)}`;
    }
  }
}

function buildFiller(lines: number, first: string): string {
  const notes = Array.from(
    { length: lines },
    (_, index) =>
      `Tide note ${String(index).padStart(4, '0')}: the harbour gauge read ${(index * 37) % 500} cm at ${String(index % 24).padStart(2, '0')}:00, wind from the ${['north', 'east', 'south', 'west'][index % 4]}.`,
  );
  return `Here are the tide notes for the season. ${first} Reply OK only.\n${notes.join('\n')}`;
}

function printTurn(label: string, turn: TurnResult): void {
  const hooks = turn.hookCalls.map((call) => `${call.event}:${call.trigger}->${JSON.stringify(call.output)}`);
  console.log(
    [
      `${label}: session=${turn.sessionID?.slice(0, 8) ?? 'none'} result=${turn.result}`,
      `  answer=${JSON.stringify(turn.answer.slice(0, 80))} input tokens=${turn.inputTokens} cost=$${turn.costUSD.toFixed(4)}`,
      `  hooks=[${hooks.join(', ')}]`,
      `  stream compact_boundary=[${turn.boundaries.join(', ')}] status=[${turn.statuses.join(', ')}]`,
    ].join('\n'),
  );
}

// the session's JSONL transcript, read straight from CLAUDE_CONFIG_DIR
function printTranscript(label: string, sessionID: string | undefined): void {
  if (sessionID === undefined) {
    console.log(`  transcript: none`);
    return;
  }
  const projects = join(configDir ?? '', 'projects');
  const file = readdirSync(projects)
    .map((dir) => join(projects, dir, `${sessionID}.jsonl`))
    .find((path) => existsSync(path));
  if (file === undefined) {
    console.log(`  transcript: not found`);
    return;
  }
  const entries = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { subtype?: string; isCompactSummary?: boolean });
  const boundaries = entries.filter((entry) => entry.subtype === 'compact_boundary').length;
  const summaries = entries.filter((entry) => entry.isCompactSummary === true).length;
  console.log(`  transcript ${label}: entries=${entries.length} compact_boundary=${boundaries} summaries=${summaries}`);
}
