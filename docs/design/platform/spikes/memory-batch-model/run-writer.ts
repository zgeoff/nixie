/* oxlint-disable max-statements -- one subprocess call and its result in one place */
import type { Item } from './conversation.ts';

export interface BatchMessage {
  id: number;
  role: 'assistant' | 'owner';
  // Owner text with each pasted span wrapped in ⟦ ⟧, as the host shows it to the writer.
  shown: string;
}

export interface WriterCandidate {
  itemID: string | null;
  op: 'remember' | 'retire' | 'revise';
  quote: string;
  sourceID: number;
  text: string | null;
}

export interface Usage {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
}

export interface WriterResult {
  apiMs: number;
  candidates: WriterCandidate[];
  error: string | null;
  model: string | null;
  // The harness's own cost figure, kept only to cross-check the price table.
  reportedUSD: number;
  usage: Usage;
  wallMs: number;
}

export interface WriterOptions {
  cwd: string;
  effort: string;
  feedback: string | null;
  model: string;
  token: string;
}

// Runs one batch through headless Claude Code with no tools but structured output. JSON output
// stands in for the writer's memory.recall, memory.remember and memory.retire tools: the host
// supplies the relevant items up front and stages each candidate itself.
export async function runWriter(
  items: Item[],
  messages: BatchMessage[],
  options: WriterOptions,
): Promise<WriterResult> {
  const prompt = buildPrompt(items, messages, options.feedback);
  const started = performance.now();
  const child = Bun.spawn(
    [
      'claude',
      '-p',
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--tools',
      '',
      '--model',
      options.model,
      '--effort',
      options.effort,
      '--system-prompt',
      SYSTEM_PROMPT,
      '--json-schema',
      JSON.stringify(OUTPUT_SCHEMA),
      '--output-format',
      'json',
      prompt,
    ],
    {
      cwd: options.cwd,
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: options.token,
        HOME: process.env['HOME'] ?? '',
        PATH: process.env['PATH'] ?? '',
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  const wallMs = Math.round(performance.now() - started);
  return parseResult(stdout, stderr, wallMs);
}

const SYSTEM_PROMPT = `You keep the long-term memory for one person's personal assistant. You read a batch of messages between the owner and the assistant, and you propose changes to the owner's memory.

Rules:
- Capture durable facts about the owner's life, preferences, people and routines that will still matter in a week. Skip requests, one-off tasks, small talk and questions.
- Each candidate needs an exact quote, copied character for character from one owner message in this batch, and that message's ID as source_id. Copy the words as typed, without fixing spelling or case.
- Text inside ⟦ ⟧ was pasted by the owner, not typed. Never quote it and never take a fact from it.
- Assistant messages are never evidence. Ignore facts that only an assistant message states.
- Never store a hypothetical, a question, a denial, a quote of someone else, or a message the owner drafted for other people as a fact about the owner.
- Write the memory text as one plain sentence about "the owner". Any email, URL, phone number or handle in it must appear in the quote.
- When a fact updates or contradicts a current item, use op "revise" with that item's ID and the new full text. When the owner says a current item stopped being true and nothing replaces it, use op "retire" with that item's ID and the owner's words as the quote. Never add a second item that repeats a current item.
- At most one revise or retire per item in a batch.
- An empty list is a good answer when nothing qualifies.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'item_id', 'text', 'quote', 'source_id'],
        properties: {
          op: { enum: ['remember', 'revise', 'retire'] },
          item_id: { type: ['string', 'null'] },
          text: { type: ['string', 'null'] },
          quote: { type: 'string' },
          source_id: { type: 'integer' },
        },
      },
    },
  },
};

function buildPrompt(items: Item[], messages: BatchMessage[], feedback: string | null): string {
  const itemLines =
    items.length === 0 ? '(none)' : items.map((item) => `- ${item.id}: ${item.text}`).join('\n');
  const messageLines = messages
    .map((message) => `[${message.id}] ${message.role}: ${message.shown}`)
    .join('\n\n');
  const retry =
    feedback === null ? '' : `\n\nYour previous answer for this batch was rejected: ${feedback}`;
  return `Current memory items:\n${itemLines}\n\nMessages in this batch:\n\n${messageLines}${retry}`;
}

interface RawCandidate {
  item_id: string | null;
  op: WriterCandidate['op'];
  quote: string;
  source_id: number;
  text: string | null;
}

interface RawResult {
  duration_api_ms?: number;
  is_error?: boolean;
  modelUsage?: Record<string, { costUSD?: number }>;
  result?: string;
  structured_output?: { candidates?: RawCandidate[] };
  usage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

function parseResult(stdout: string, stderr: string, wallMs: number): WriterResult {
  let raw: RawResult;
  try {
    raw = JSON.parse(stdout) as RawResult;
  } catch {
    return buildFailure(`unreadable output: ${(stdout || stderr).slice(0, 300)}`, wallMs);
  }
  const usage: Usage = {
    cacheRead: raw.usage?.cache_read_input_tokens ?? 0,
    cacheWrite: raw.usage?.cache_creation_input_tokens ?? 0,
    input: raw.usage?.input_tokens ?? 0,
    output: raw.usage?.output_tokens ?? 0,
  };
  const model = Object.keys(raw.modelUsage ?? {})[0] ?? null;
  const reportedUSD = Object.values(raw.modelUsage ?? {}).reduce(
    (sum, entry) => sum + (entry.costUSD ?? 0),
    0,
  );
  const output = raw.structured_output?.candidates;
  if (raw.is_error === true || output === undefined) {
    return {
      ...buildFailure(`writer error: ${(raw.result ?? '').slice(0, 300)}`, wallMs),
      model,
      reportedUSD,
      usage,
    };
  }
  return {
    apiMs: raw.duration_api_ms ?? 0,
    candidates: output.map((candidate) => ({
      itemID: candidate.item_id,
      op: candidate.op,
      quote: candidate.quote,
      sourceID: candidate.source_id,
      text: candidate.text,
    })),
    error: null,
    model,
    reportedUSD,
    usage,
    wallMs,
  };
}

function buildFailure(error: string, wallMs: number): WriterResult {
  return {
    apiMs: 0,
    candidates: [],
    error,
    model: null,
    reportedUSD: 0,
    usage: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    wallMs,
  };
}
