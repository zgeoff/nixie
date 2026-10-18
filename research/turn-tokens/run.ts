// Runs one role's sessions on one model and effort through the production guest code, with every
// model request going through the local counting proxy, and writes runs/<role>-<model>-<effort>.json.
//
//   bun run.ts <role> <model> <effort>
//
// The conversation and the memory roles use the built prompts and tools. task and worker are not
// built yet, so their runs are simulations with the conversation's tools and a plain worker prompt.
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore a spike imports the code it measures
import type { LogRecord } from '../../modules/log/src/index';
// @boundaries-ignore a spike imports the code it measures
import type { GuestFrame, InboxMessage } from '../../libs/wire/src/index';
// @boundaries-ignore a spike imports the code it measures
import { runCheckQuery } from '../../guests/conversation/src/run-check-query';
// @boundaries-ignore a spike imports the code it measures
import { runTurn } from '../../guests/conversation/src/run-turn';
// @boundaries-ignore a spike imports the code it measures
import { renderConsolidatorPrompt } from '../../modules/memory/src/render-consolidator-prompt';
// @boundaries-ignore a spike imports the code it measures
import { renderConsolidatorSystemPrompt } from '../../modules/memory/src/render-consolidator-system-prompt';
// @boundaries-ignore a spike imports the code it measures
import { renderMemoryCheckerPrompt } from '../../modules/memory/src/render-memory-checker-prompt';
// @boundaries-ignore a spike imports the code it measures
import { renderWriterPrompt } from '../../modules/memory/src/render-writer-prompt';
// @boundaries-ignore a spike imports the code it measures
import { renderWriterSystemPrompt } from '../../modules/memory/src/render-writer-system-prompt';
// @boundaries-ignore a spike imports the code it measures
import { encodeInboxUUID } from '../../modules/sessions/src/encode-inbox-uuid';
// @boundaries-ignore a spike imports the code it measures
import { renderInboxMessage } from '../../modules/sessions/src/render-inbox-message';
// @boundaries-ignore a spike imports the code it measures
import { buildModelStatus } from '../../modules/sessions/src/build-model-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStartStatus } from '../../modules/sessions/src/build-start-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStartTimeStatus } from '../../modules/sessions/src/build-start-time-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStatusRegistry } from '../../modules/sessions/src/build-status-registry';
// @boundaries-ignore a spike imports the code it measures
import { formatMessageTime } from '../../modules/sessions/src/format-message-time';
// @boundaries-ignore a spike imports the code it measures
import { renderPinnedMemory } from '../../modules/sessions/src/render-pinned-memory';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemMessage } from '../../libs/wire/src/index';
// @boundaries-ignore a spike imports the code it measures
import { buildVersionStatus } from '../../apps/server/src/build-version-status';
// @boundaries-ignore a spike imports the code it measures
import { renderRetrievedItems } from '../../modules/sessions/src/render-retrieved-items';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemPrompt } from '../../modules/sessions/src/render-system-prompt';
// @boundaries-ignore a spike imports the code it measures
import { buildCheckerEvalInput } from '../../evals/test-utils/build-checker-eval-input';
// @boundaries-ignore a spike imports the code it measures
import { loadCheckerCorpus } from '../../evals/test-utils/load-checker-corpus';
import type { ToolSet } from './build-role-tools';
import { buildRoleTools } from './build-role-tools';
import { fixtures } from './spike-fixtures';
import type { CallUsage } from './start-count-proxy';
import { startCountProxy } from './start-count-proxy';
import { startToolServer } from './start-tool-server';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface SessionResult {
  readonly label: string;
  readonly guestUsage: Record<string, number> | null;
  readonly modelCalls: number | null;
  readonly toolCalls: readonly string[];
  readonly calls: readonly CallUsage[];
  readonly replies: readonly string[];
  readonly error: string | null;
}

const [role = '', model = '', effort = 'low'] = process.argv.slice(2);
const proxy = startCountProxy();
const lines = { ownerName: fixtures.ownerName, defaultZone: 'Europe/Lisbon', now: new Date(fixtures.day) };
const dir = import.meta.dir;
const runners: Record<string, () => Promise<readonly SessionResult[]>> = {
  conversation: runConversation,
  checker: runChecker,
  'memory-writer': runWriter,
  'memory-consolidator': runConsolidator,
  task: runTasks,
  worker: runWorkers,
};
const runner = runners[role];

if (runner === undefined || model === '') {
  console.error('usage: bun run.ts <role> <model> <effort>');
  process.exit(1);
}
const sessions = await runner();

await proxy.stop();
await mkdir(join(dir, 'runs'), { recursive: true });
await Bun.write(
  join(dir, 'runs', `${role}-${model}-${effort}.json`),
  `${JSON.stringify({ role, model, effort, ranAt: new Date().toISOString(), sessions }, null, 2)}\n`,
);
console.log(`${role} ${model} ${effort}: ${sessions.length} sessions, ${proxy.calls.length} model calls`);

// 12 turns on one session, each resuming at the last turn's boundary, as the conversation does
async function runConversation(): Promise<readonly SessionResult[]> {
  const home = await mkdtemp(join(tmpdir(), 'turn-tokens-'));
  const systemPrompt = renderSystemPrompt(fixtures.persona, lines);
  const results: SessionResult[] = [];
  let resume: { sessionID: string; messageID: string } | null = null;

  for (const [index, message] of fixtures.conversation.entries()) {
    const record = buildOwnerRecord(ownerSequence(index), fixtures.day + index * 600_000, message.text);
    const times = { ...lines, now: record.recordedAt };
    const at = formatMessageTime(times.now, null, times);
    const retrieved = renderRetrievedItems(
      message.retrieved.map((item) => fixtures.otherItems[item]!),
      times,
    );
    // a new session opens with the pinned memory and the status, and every turn's retrieved items
    // follow, all before the message in the same message, as the live turn joins them
    const preamble = [
      ...(resume === null ? await renderSessionOpening(times) : []),
      ...(retrieved === null ? [] : [renderSystemMessage({ type: 'retrieved-memory', at, body: retrieved })]),
    ];
    const input = [
      {
        uuid: encodeInboxUUID(record.sequence),
        text: [...preamble, renderInboxMessage(record, times)].join('\n\n'),
      },
    ];
    // oxlint-disable-next-line no-await-in-loop -- each turn resumes where the one before ended
    const result = await runGuestSession(`turn-${index + 1}`, 'conversation', {
      home,
      systemPrompt,
      input,
      resume,
    });

    results.push(result.session);
    resume = result.boundary;
    if (resume === null) {
      return results;
    }
  }

  // with COLD_WAIT_S set, one more turn after the prompt cache's 5-minute lifetime has passed
  const coldWait = Number(process.env['COLD_WAIT_S'] ?? 0);

  if (coldWait > 0) {
    await Bun.sleep(coldWait * 1000);
    const record = buildOwnerRecord(
      ownerSequence(fixtures.conversation.length),
      Date.UTC(2026, 9, 14, 15, 40),
      'Back again. Which train did we pick for the Douro trip?',
    );
    const result = await runGuestSession('turn-13-cold', 'conversation', {
      home,
      systemPrompt,
      input: [
        {
          uuid: encodeInboxUUID(record.sequence),
          text: renderInboxMessage(record, { ...lines, now: record.recordedAt }),
        },
      ],
      resume,
    });

    results.push(result.session);
  }
  return results;
}

// the production checker prompt on the eval corpus's first 12 pairs, one fresh query each
async function runChecker(): Promise<readonly SessionResult[]> {
  const corpus = await loadCheckerCorpus(join(dir, '../../evals/memory-checker/corpus.json'));
  const prompt = renderMemoryCheckerPrompt(fixtures.ownerName);
  const pairs = corpus.samples
    .flatMap((sample) => sample.pairs.map((pair) => ({ sample, pair })))
    .slice(0, 12);
  const home = await mkdtemp(join(tmpdir(), 'turn-tokens-'));
  const results: SessionResult[] = [];

  for (const [index, { sample, pair }] of pairs.entries()) {
    const label = `check-${index + 1}`;
    // oxlint-disable-next-line no-await-in-loop -- one call at a time keeps the counts apart
    const reply = await runCheckQuery(
      {
        profile: { model, baseURL: `${proxy.url}/${label}`, effort: effort as Effort, authHeader: 'x-api-key' },
        systemPrompt: prompt,
        input: buildCheckerEvalInput(sample, pair, fixtures.ownerName),
      },
      { env: buildGuestEnv(home) },
    );

    await proxy.waitForCounts();
    results.push({
      label,
      guestUsage: null,
      modelCalls: null,
      toolCalls: [],
      calls: proxy.calls.filter((call) => call.tag === label),
      replies: [reply.kind === 'answer' ? JSON.stringify(reply.output) : reply.reason],
      error: reply.kind === 'answer' ? null : reply.reason,
    });
  }
  return results;
}

// the conversation's 24 messages in batches of 4, the writer's default, with 20 shown items
async function runWriter(): Promise<readonly SessionResult[]> {
  // the replies of the Opus conversation run, which runs first
  const conversationRun = (await Bun.file(
    join(dir, 'runs', 'conversation-claude-opus-5-5-medium.json'),
  ).json()) as { sessions: SessionResult[] };
  const messages = fixtures.conversation.flatMap((message, index) => [
    { sequence: ownerSequence(index), role: 'owner' as const, shown: message.text, recordedAt: fixtures.day + index * 600_000 },
    {
      sequence: ownerSequence(index) + 1,
      role: 'assistant' as const,
      shown: conversationRun.sessions[index]?.replies.join('\n\n') ?? '',
      recordedAt: fixtures.day + index * 600_000 + 20_000,
    },
  ]);
  const items = [...fixtures.coreItems, ...fixtures.otherItems.slice(0, 10)].map((item) => ({
    itemID: item.shortID,
    version: item.version,
    subject: 'owner' as const,
    text: item.text,
  }));
  const names = { owner: fixtures.ownerName, assistant: null };
  const systemPrompt = renderWriterSystemPrompt(fixtures.persona, names);
  const results: SessionResult[] = [];

  for (let start = 0; start < messages.length; start += 4) {
    const prompt = renderWriterPrompt({
      items,
      isComplete: false,
      proposals: [],
      messages: messages.slice(start, start + 4),
      names,
    });
    // oxlint-disable-next-line no-await-in-loop -- the writer runs one batch at a time
    const result = await runGuestSession(`batch-${start / 4 + 1}`, 'memory-writer', {
      home: await mkdtemp(join(tmpdir(), 'turn-tokens-')),
      systemPrompt,
      input: [buildPlainMessage(prompt)],
      resume: null,
    });

    results.push(result.session);
  }
  return results;
}

// one consolidation over 60 items, the 10 pinned and 50 others, each with its quote
async function runConsolidator(): Promise<readonly SessionResult[]> {
  const items = [...fixtures.coreItems, ...fixtures.otherItems].map((item, index) => ({
    ...item,
    isPinned: index < fixtures.coreItems.length,
  }));
  const result = await runGuestSession('consolidation-1', 'memory-consolidator', {
    home: await mkdtemp(join(tmpdir(), 'turn-tokens-')),
    systemPrompt: renderConsolidatorSystemPrompt(fixtures.persona, 30, fixtures.ownerName),
    input: [buildPlainMessage(renderConsolidatorPrompt({ items, isComplete: true }))],
    resume: null,
  });

  return [result.session];
}

// simulated: a job run as one fresh session on the conversation's prompt, opening and tools
async function runTasks(): Promise<readonly SessionResult[]> {
  const systemPrompt = renderSystemPrompt(fixtures.persona, lines);
  const opening = await renderSessionOpening(lines);
  const results: SessionResult[] = [];

  for (const [index, job] of fixtures.jobs.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one job at a time keeps the counts apart
    const result = await runGuestSession(`job-${index + 1}`, 'conversation', {
      home: await mkdtemp(join(tmpdir(), 'turn-tokens-')),
      systemPrompt,
      input: [buildPlainMessage([...opening, job].join('\n\n'))],
      resume: null,
    });

    results.push(result.session);
  }
  return results;
}

// simulated: a narrow worker run with web fetch alone and a one-paragraph prompt
async function runWorkers(): Promise<readonly SessionResult[]> {
  const results: SessionResult[] = [];

  for (const [index, brief] of fixtures.workerBriefs.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one worker at a time keeps the counts apart
    const result = await runGuestSession(`worker-${index + 1}`, 'worker', {
      home: await mkdtemp(join(tmpdir(), 'turn-tokens-')),
      systemPrompt: fixtures.workerPrompt,
      input: [buildPlainMessage(brief)],
      resume: null,
    });

    results.push(result.session);
  }
  return results;
}

interface GuestSession {
  readonly home: string;
  readonly systemPrompt: string;
  readonly input: readonly InboxMessage[];
  readonly resume: { sessionID: string; messageID: string } | null;
}

// runs one turn of the production guest against the scripted tool server and the counting proxy
async function runGuestSession(
  label: string,
  tools: ToolSet,
  session: GuestSession,
): Promise<{ session: SessionResult; boundary: { sessionID: string; messageID: string } | null }> {
  const server = startToolServer(buildRoleTools(tools), (name, input) =>
    fixtures.answerCall(tools, name, input),
  );
  const frames: GuestFrame[] = [];
  let error: string | null = null;

  try {
    await runTurn(
      {
        type: 'turn',
        profile: {
          model,
          baseURL: `${proxy.url}/${label}`,
          effort: effort as Effort,
          authHeader: 'x-api-key',
          contextTokens: null,
          cacheTTL: '5m',
        },
        tools: { url: server.config.url, token: 'unused' },
        resume: session.resume,
        systemPrompt: session.systemPrompt,
        input: session.input,
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

  const ended = frames.filter((frame) => frame.type === 'ended');
  const failed = frames.find((frame) => frame.type === 'failed');
  const last = ended.at(-1);
  const sumEnded = (pick: (frame: (typeof ended)[number]) => number) =>
    ended.reduce((total, frame) => total + pick(frame), 0);
  const result: SessionResult = {
    label,

    // the guest's own count, summed over each result as the step sums it, beside the proxy's
    guestUsage:
      last === undefined
        ? null
        : {
            inputTokens: sumEnded((frame) => frame.usage.inputTokens),
            outputTokens: sumEnded((frame) => frame.usage.outputTokens),
            cacheReadTokens: sumEnded((frame) => frame.usage.cacheReadTokens),
            cacheWriteTokens: sumEnded((frame) => frame.usage.cacheWriteTokens),
            contextSize: last.context?.size ?? 0,
          },
    modelCalls: ended.length === 0 ? null : sumEnded((frame) => frame.turns),
    toolCalls: server.calls,
    calls: proxy.calls.filter((call) => call.tag === label),
    replies: frames.flatMap((frame) => (frame.type === 'assistant' && frame.text !== '' ? [frame.text] : [])),
    error: error ?? (failed === undefined ? null : `${failed.reason}: ${failed.detail}`),
  };

  console.log(
    `${label}: ${result.calls.length} calls, tools ${server.calls.join(' ') || '-'}${result.error === null ? '' : `, error ${result.error}`}`,
  );
  return { session: result, boundary: last?.boundary ?? null };
}

// the event ID of the owner's message at an index, with the reply's ID after it, as the log numbers
// a conversation's records
function ownerSequence(index: number): number {
  return 100 + index * 2;
}

// the blocks a first session opens with, as the production opening renders them: the pinned memory
// and the status the server's registry reads; a first session has no summary and no recent turns
async function renderSessionOpening(times: typeof lines): Promise<readonly string[]> {
  const at = formatMessageTime(times.now, null, times);
  const facts = { start: { kind: 'first' as const }, openedAt: times.now, times, model };
  const status = await Promise.all(
    buildStatusRegistry([buildStartStatus(), buildStartTimeStatus(), buildVersionStatus(), buildModelStatus()]).map(
      (entry) => entry.read(facts),
    ),
  );

  return [
    renderSystemMessage({ type: 'pinned-memory', at, body: renderPinnedMemory(fixtures.coreItems, times) }),
    renderSystemMessage({ type: 'status', at, body: status.map((line) => `- ${line.text}`).join('\n') }),
  ];
}

// an owner's message as the log returns it, sent from Lisbon, which the production inbox renders
function buildOwnerRecord(sequence: number, recordedAt: number, text: string): LogRecord {
  return {
    sequence,
    recordedAt: new Date(recordedAt),
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:spike' },
    thread: null,
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: { timeZone: 'Europe/Lisbon' },
    erasable: { status: 'readable', fields: { text } },
  };
}

// a role's prompt as one input message with no record behind it
function buildPlainMessage(text: string): InboxMessage {
  return { uuid: crypto.randomUUID(), text };
}

// the guest's own environment: its home, the placeholder the grant would swap, and the host's proxy
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
