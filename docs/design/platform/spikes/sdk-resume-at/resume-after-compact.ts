// Checks whether a resume at a step's recorded boundary still works after the session compacted past
// that boundary and the next step crashed.
// Usage: bun --no-env-file resume-after-compact.ts <config-dir> [scenarios, default MUAT]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getSessionMessages, query } from '@anthropic-ai/claude-agent-sdk';

interface TurnResult {
  answer: string;
  compactions: string[];
  context: number;
  cost: number;
  sessionID: string;
}

interface Seed {
  boundary: string;
  sessionID: string;
}

const ask = 'What is the code word? Answer with the word only.',
  configDir = process.argv.at(2),
  scenarios = process.argv.at(3) ?? 'MUAT',
  cwd = resolve(import.meta.dir),
  // auto-compaction then fires at 15% of a 100,000-token window, under the seed's 24,000 tokens
  autoCompactEnv = { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '15', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' },
  // auto-compaction then fires above the seed's 24,000 tokens and below the seed plus the read file
  toolCompactEnv = { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '40', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' },
  cherryStory =
    'The code word is now CHERRY. Write a 400-word story about a stock count that uses it, then confirm.',
  systemPrompt = 'You are a terse assistant in a test. Follow the instructions exactly.';

if (!configDir) {
  throw new Error('usage: resume-after-compact.ts <config-dir>');
}

// getSessionMessages() reads sessions in this process, so it needs the directory.
process.env.CLAUDE_CONFIG_DIR = configDir;

const runs: Record<string, () => Promise<void>> = {
  A: runAutoCompaction,
  M: runManualCompaction,
  T: runToolCompaction,
  U: runUncommittedCompaction,
};
for (const scenario of scenarios) {
  await runs[scenario]?.();
}

// M: a /compact between the boundary and the crashed step, as its own call.
async function runManualCompaction(): Promise<void> {
  const seed = await runSeed('M');

  await runTurn('M compaction', '/compact', { resume: seed.sessionID });
  const compacted = loadTranscript('M after compaction', seed.sessionID, seed.boundary),
    boundaryAfter = compacted.lastUUID;

  await runCrashedTurn('M turn 3 crashed', seed.sessionID, cherryStory, {});
  const crashed = loadTranscript('M after crash', seed.sessionID, seed.boundary);
  await printChain('M chain after crash', seed.sessionID);

  const atBoundary = await runTurn('M1 resumeSessionAt old boundary', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeSessionAt: seed.boundary,
  });
  loadTranscript('M1 fork', atBoundary.sessionID, seed.boundary);
  await printChain('M1 fork chain', atBoundary.sessionID);

  await runTurn('M2 resumeSessionAt + resumeDropsTurn', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeDropsTurn: crashed.lastPromptUUID,
    resumeSessionAt: seed.boundary,
  });

  const afterCompaction = await runTurn('M3 resumeSessionAt post-compaction boundary', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeSessionAt: boundaryAfter,
  });
  await printChain('M3 fork chain', afterCompaction.sessionID);

  await runTurn('M control plain resume', ask, { forkSession: true, resume: seed.sessionID });
}

// U: the compaction also covers an uncommitted turn, so the boundary falls outside what it keeps.
async function runUncommittedCompaction(): Promise<void> {
  const seed = await runSeed('U');

  await runTurn('U turn 3 uncommitted', 'The code word is now CHERRY. Reply with OK only.', {
    resume: seed.sessionID,
  });
  await runTurn('U compaction', '/compact', { resume: seed.sessionID });
  loadTranscript('U after compaction', seed.sessionID, seed.boundary);

  await runCrashedTurn(
    'U turn 4 crashed',
    seed.sessionID,
    'The code word is now DATE. Write a 400-word story about a stock count that uses it, then confirm.',
    {},
  );
  loadTranscript('U after crash', seed.sessionID, seed.boundary);
  await printChain('U chain after crash', seed.sessionID);

  const atBoundary = await runTurn('U1 resumeSessionAt old boundary', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeSessionAt: seed.boundary,
  });
  loadTranscript('U1 fork', atBoundary.sessionID, seed.boundary);
  await printChain('U1 fork chain', atBoundary.sessionID);

  await runTurn('U control plain resume', ask, { forkSession: true, resume: seed.sessionID });
}

// A: auto-compaction fires inside the crashed step, before its model call.
async function runAutoCompaction(): Promise<void> {
  const seed = await runSeed('A');

  await runCrashedTurn('A turn 3 crashed', seed.sessionID, cherryStory, autoCompactEnv);
  loadTranscript('A after crash', seed.sessionID, seed.boundary);
  await printChain('A chain after crash', seed.sessionID);

  const atBoundary = await runTurn('A1 resumeSessionAt old boundary', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeSessionAt: seed.boundary,
  });
  loadTranscript('A1 fork', atBoundary.sessionID, seed.boundary);
  await printChain('A1 fork chain', atBoundary.sessionID);

  await runTurn('A control plain resume', ask, { forkSession: true, resume: seed.sessionID });
}

// T: the crashed step reads a file, and auto-compaction fires between its model calls.
async function runToolCompaction(): Promise<void> {
  const seed = await runSeed('T'),
    notesPath = join(configDir ?? '', 'stock-notes.txt');
  writeFileSync(notesPath, `${buildNotes(3, 1000)}\nThe code word is now CHERRY.\n`);

  await runCrashedTurn(
    'T turn 3 crashed',
    seed.sessionID,
    `Read the file ${notesPath}. Its last line sets a new code word. Then write a 400-word story about a stock count that uses the new code word, then confirm.`,
    toolCompactEnv,
    'Read',
  );
  const crashed = loadTranscript('T after crash', seed.sessionID, seed.boundary);
  await printChain('T chain after crash', seed.sessionID);

  const atBoundary = await runTurn('T1 resumeSessionAt old boundary', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeSessionAt: seed.boundary,
  });
  loadTranscript('T1 fork', atBoundary.sessionID, seed.boundary);
  await printChain('T1 fork chain', atBoundary.sessionID);

  await runTurn('T2 resumeSessionAt + resumeDropsTurn', ask, {
    forkSession: true,
    resume: seed.sessionID,
    resumeDropsTurn: crashed.lastPromptUUID,
    resumeSessionAt: seed.boundary,
  });

  await runTurn('T control plain resume', ask, { forkSession: true, resume: seed.sessionID });
}

// Turn 1 sets the code word and turn 2 changes it; turn 2's commit records the boundary.
async function runSeed(label: string): Promise<Seed> {
  const first = await runTurn(
    `${label} turn 1`,
    `The code word is APPLE. Keep these stock notes for later.\n${buildNotes(1, 600)}\nReply with OK only.`,
    {},
  );
  await runTurn(
    `${label} turn 2`,
    `The code word is now BANANA. More stock notes.\n${buildNotes(2, 600)}\nReply with OK only.`,
    { resume: first.sessionID },
  );
  const transcript = loadTranscript(`${label} boundary`, first.sessionID, undefined);
  return { boundary: transcript.lastUUID, sessionID: first.sessionID };
}

// invented stock notes, about 19 tokens a line, so the session has something to compact
function buildNotes(batch: number, length: number): string {
  const items = ['paper clips', 'staplers', 'desk lamps', 'notebooks', 'cable ties', 'mugs'];
  return Array.from({ length }, (_, index) => {
    const shelf = batch * 1000 + index;
    return `Shelf ${shelf}: ${(index * 7) % 90} ${items[index % items.length]}, counted on day ${index % 28}.`;
  }).join('\n');
}

async function runTurn(label: string, prompt: string, extra: Partial<Options>): Promise<TurnResult> {
  const result: TurnResult = { answer: '', compactions: [], context: 0, cost: 0, sessionID: '' };
  try {
    for await (const message of query({ options: buildOptions(extra), prompt })) {
      collect(result, message);
    }
  } catch (error) {
    result.answer += `[threw ${String(error).slice(0, 160)}]`;
  }
  console.log(
    `${label}: session=${result.sessionID.slice(0, 8)} context=${result.context} cost=$${result.cost.toFixed(4)} compactions=[${result.compactions.join(', ')}] answer=${JSON.stringify(result.answer.trim())}`,
  );
  return result;
}

function buildOptions(extra: Partial<Options>): Options {
  return {
    cwd,
    env: buildEnv({}),
    maxTurns: 1,
    model: 'claude-haiku-4-5-20251001',
    settingSources: [],
    systemPrompt,
    tools: [],
    ...extra,
  };
}

// only what the CLI needs, plus the egress proxy where a broker adds the model credential
function buildEnv(extra: Record<string, string>): Record<string, string> {
  const proxy = Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      /proxy|^SSL_CERT_FILE$|^NODE_EXTRA_CA_CERTS$/i.test(entry[0]) && entry[1] !== undefined,
  );
  return {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? 'placeholder',
    CLAUDE_CONFIG_DIR: configDir ?? '',
    HOME: process.env.HOME ?? '',
    PATH: process.env.PATH ?? '',
    ...Object.fromEntries(proxy),
    ...extra,
  };
}

function collect(result: TurnResult, message: SDKMessage): void {
  if ('session_id' in message && message.session_id) {
    result.sessionID = message.session_id;
  }
  if (message.type === 'system' && message.subtype === 'compact_boundary') {
    const { pre_tokens: pre, trigger } = message.compact_metadata;
    result.compactions.push(`${trigger} pre=${pre}`);
  } else if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        result.answer += block.text;
      }
    }
  } else if (message.type === 'result') {
    const usage = message.usage;
    result.cost = message.total_cost_usd;
    result.context =
      usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
    if (message.subtype !== 'success') {
      result.answer += `[result ${message.subtype}: ${message.errors.join('; ').slice(0, 200)}]`;
    } else if (message.is_error) {
      result.answer += `[is_error ${message.result}]`;
    }
  }
}

// Runs the turn in its own process group and kills the group with SIGKILL once text streams,
// after the turn's compaction when the turn compacts.
async function runCrashedTurn(
  label: string,
  sessionID: string,
  prompt: string,
  extraEnv: Record<string, string>,
  tool?: string,
): Promise<void> {
  const child = Bun.spawn(
      [
        'setsid',
        process.execPath,
        '--no-env-file',
        join(cwd, 'crash-turn.ts'),
        configDir ?? '',
        sessionID,
        prompt,
        systemPrompt,
        ...(tool === undefined ? [] : [tool]),
      ],
      { env: buildEnv(extraEnv), stderr: 'inherit', stdout: 'pipe' },
    ),
    events: string[] = [],
    needsCompaction = Object.keys(extraEnv).length > 0;
  let buffer = '';
  for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    events.push(...lines);
    const compactedAt = events.findIndex((event) => event.startsWith('event compact_boundary')),
      hasTextAfterCompaction = compactedAt >= 0 && events.slice(compactedAt + 1).includes('event text');
    if (needsCompaction ? hasTextAfterCompaction : events.includes('event text')) {
      process.kill(-child.pid, 'SIGKILL');
      break;
    }
  }
  await child.exited;
  if (child.signalCode !== 'SIGKILL') {
    throw new Error(`${label}: the turn ended before the kill, events=[${events.join(' | ')}]`);
  }
  await Bun.sleep(1000);
  const left = Bun.spawnSync(['pgrep', '-g', String(child.pid)]).stdout.toString().trim();
  console.log(
    `${label}: killed=${child.signalCode} events=[${events.join(' | ')}] left in group=${left === '' ? 0 : left.split('\n').length}`,
  );
}

interface Transcript {
  lastPromptUUID: string;
  lastUUID: string;
}

interface TranscriptEntry {
  compactMetadata?: { preservedMessages?: { uuids: string[] } };
  isCompactSummary?: boolean;
  isMeta?: boolean;
  message?: { content?: unknown };
  subtype?: string;
  type: string;
  uuid?: string;
}

// Reads the raw transcript file, where every entry the CLI wrote stays, compacted or not.
function loadTranscript(label: string, sessionID: string, boundary: string | undefined): Transcript {
  const lines = findTranscriptLines(sessionID);
  if (lines === undefined) {
    console.log(`${label}: no transcript file`);
    return { lastPromptUUID: '', lastUUID: '' };
  }
  const entries = lines.map((line) => JSON.parse(line) as TranscriptEntry),
    chain = entries.filter((entry) => entry.uuid !== undefined),
    prompts = chain.filter((entry) => getEntryKind(entry) === 'prompt'),
    compactions = chain.filter((entry) => entry.subtype === 'compact_boundary'),
    preserved = compactions.flatMap((entry) => entry.compactMetadata?.preservedMessages?.uuids ?? []),
    lastPreserved = compactions.at(-1)?.compactMetadata?.preservedMessages?.uuids ?? [],
    preservedKinds = lastPreserved.map((uuid) => {
      const entry = chain.findLast((candidate) => candidate.uuid === uuid);
      return entry === undefined ? 'missing' : getEntryKind(entry);
    }),
    hasBoundary = boundary === undefined ? '-' : chain.some((entry) => entry.uuid === boundary),
    preservesBoundary = boundary === undefined ? '-' : preserved.includes(boundary);
  console.log(
    `${label}: file entries=${entries.length} chain entries=${chain.length} compact_boundary=${compactions.length} holds boundary=${hasBoundary} preserves boundary=${preservesBoundary} preserved=[${preservedKinds.join(',')}] last=${chain.at(-1)?.type}`,
  );
  return { lastPromptUUID: prompts.at(-1)?.uuid ?? '', lastUUID: chain.at(-1)?.uuid ?? '' };
}

// tells a typed prompt from a tool result and from the CLI's own user entries
function getEntryKind(entry: TranscriptEntry): string {
  if (entry.type !== 'user') {
    return entry.subtype ?? entry.type;
  }
  if (entry.isCompactSummary) {
    return 'summary';
  }
  if (entry.isMeta) {
    return 'meta';
  }
  const content = entry.message?.content,
    isToolResult =
      Array.isArray(content) &&
      content.some((block: { type?: string }) => block.type === 'tool_result');
  return isToolResult ? 'tool_result' : 'prompt';
}

function findTranscriptLines(sessionID: string): string[] | undefined {
  const projects = join(configDir ?? '', 'projects');
  if (!existsSync(projects)) {
    return undefined;
  }
  for (const project of readdirSync(projects)) {
    const path = join(projects, project, `${sessionID}.jsonl`);
    if (existsSync(path)) {
      return readFileSync(path, 'utf8').split('\n').filter(Boolean);
    }
  }
  return undefined;
}

// The chain a resume loads, as the SDK reads it.
async function printChain(label: string, sessionID: string): Promise<void> {
  const messages = await getSessionMessages(sessionID, { dir: cwd });
  console.log(
    `${label}: ${messages.length} messages, types ${messages.map((entry) => entry.type).join(',')}`,
  );
}
