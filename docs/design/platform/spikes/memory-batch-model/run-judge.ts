import type { Conversation } from './conversation.ts';
import type { Usage } from './run-writer.ts';

export interface JudgedCandidate {
  index: number;
  label: 'acceptable' | 'duplicate' | 'gold' | 'trap' | 'unsupported';
  ref: string | null;
}

export interface Verdicts {
  candidates: JudgedCandidate[];
  error: string | null;
  usage: Usage;
}

export interface JudgeInput {
  candidates: { index: number; op: string; outcome: string; quote: string; text: string | null }[];
}

// An Opus judge labels every candidate against the gold facts and traps. Code, not the judge, scores
// the final memory, and the judge never sees the writer's prompt.
export async function runJudge(
  conversation: Conversation,
  input: JudgeInput,
  options: { cwd: string; token: string },
): Promise<Verdicts> {
  const prompt = `Gold facts a good memory writer captures:
${formatRecord(conversation.gold)}

Traps it must not store as facts about the owner:
${formatRecord(conversation.traps)}

Seed items that existed before the conversation:
${conversation.seed.map((item) => `- ${item.id}: ${item.text}`).join('\n')}

Every candidate the writer produced, with the host's outcome (applied, proposal with a reason, or no-op):
${input.candidates.map((candidate) => `- #${candidate.index} ${candidate.op} [${candidate.outcome}] text=${JSON.stringify(candidate.text)} quote=${JSON.stringify(candidate.quote)}`).join('\n')}


Label every candidate: "gold" with the gold ID it captures (a revise or retire that carries out a gold change counts, even when a detail of the gold wording differs), "trap" with the trap ID, "duplicate" if it repeats a fact an earlier candidate or a seed item already holds, "acceptable" for a true, durable owner fact that is not in the gold list, or "unsupported" for anything else. Judge the candidate itself, whatever its outcome.`;
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
      'claude-opus-5-5',
      '--effort',
      'medium',
      '--system-prompt',
      'You grade the output of a memory writer against a gold list. Be strict and literal.',
      '--json-schema',
      JSON.stringify(JUDGE_SCHEMA),
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
      // A hung call ends with empty output, which reads as a judge error.
      timeout: 300_000,
    },
  );
  const [stdout] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  return parseVerdicts(stdout);
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'label', 'ref'],
        properties: {
          index: { type: 'integer' },
          label: { enum: ['gold', 'trap', 'duplicate', 'acceptable', 'unsupported'] },
          ref: { type: ['string', 'null'] },
        },
      },
    },
  },
};

function formatRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([id, text]) => `- ${id}: ${text}`)
    .join('\n');
}

function parseVerdicts(stdout: string): Verdicts {
  try {
    const raw = JSON.parse(stdout) as {
      structured_output?: { candidates: JudgedCandidate[] };
      usage?: Record<string, number>;
    };
    const usage: Usage = {
      cacheRead: raw.usage?.['cache_read_input_tokens'] ?? 0,
      cacheWrite: raw.usage?.['cache_creation_input_tokens'] ?? 0,
      input: raw.usage?.['input_tokens'] ?? 0,
      output: raw.usage?.['output_tokens'] ?? 0,
    };
    if (raw.structured_output === undefined) {
      return { candidates: [], error: stdout.slice(0, 300), usage };
    }
    return { ...raw.structured_output, error: null, usage };
  } catch {
    return {
      candidates: [],
      error: stdout.slice(0, 300),
      usage: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
    };
  }
}
