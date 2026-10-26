// Measures the consent checker on a deployment's own messages. Each command reads and writes files
// outside the repo, because they hold the user's own messages, and prints counts and rates only.
//
//   bun run.ts cases --plain <records.jsonl> --out <cases.jsonl>
//   bun run.ts label --plain <records.jsonl> --cases <cases.jsonl> --persona <persona.md>
//     --out <labels.jsonl> --home <dir> [--checks <checks.jsonl>] [--limit <n>]
//   bun run.ts check --cases <cases.jsonl> --out <checks.jsonl> --home <dir>
//     [--labels <labels.jsonl>] [--limit <n>]
//   bun run.ts score --cases <cases.jsonl> --labels <labels.jsonl> --checks <checks.jsonl>
//
// `label` and `check` take --model, --effort, --budget and --concurrency too. They read the model
// credential from ANTHROPIC_AUTH_TOKEN and send it as a bearer token, as a deployment's profile
// does, and one budget covers the spend in both output files.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { runCheckQuery } from '../../guests/conversation/src/run-check-query.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { plainRecordSchema } from '../memory-retrieval/real-turns/read-plain-export.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { readJSONLines } from '../memory-retrieval/real-turns/read-json-lines.ts';
import { buildConsentCases } from './consent/build-consent-cases.ts';
import { buildLabelTurns } from './consent/build-label-turns.ts';
import { buildLabels } from './consent/build-labels.ts';
import { runChecks } from './consent/run-checks.ts';
import { runLabels } from './consent/run-labels.ts';
import type { Rate } from './consent/score-verdicts.ts';
import { scoreVerdicts } from './consent/score-verdicts.ts';
import { checkRecordSchema, consentCaseSchema, labelRecordSchema, labellerOutputSchema } from './consent/types.ts';

const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

// The checker role's profile, and the conversation role's profile for the labeller, in the
// deployment this spike measures.
const checkerProfile = { model: 'claude-sonnet-5-5', effort: 'high' };
const labellerProfile = { model: 'claude-opus-5-5', effort: 'medium' };

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    plain: { type: 'string' },
    cases: { type: 'string' },
    checks: { type: 'string' },
    labels: { type: 'string' },
    persona: { type: 'string' },
    out: { type: 'string' },
    home: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string' },
    budget: { type: 'string', default: '4' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '2' },
  },
});

const command = positionals[0];

if (command === 'cases') {
  await writeCases(requireFlag(values.plain, '--plain'), requireFlag(values.out, '--out'));
} else if (command === 'label') {
  await runLabelCommand();
} else if (command === 'check') {
  await runCheckCommand();
} else if (command === 'score') {
  await printScore();
} else {
  throw new Error(`unknown command ${command ?? '(none)'}; pass cases, label, check or score`);
}

function requireFlag(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`pass ${flag}`);
  }

  return value;
}

async function writeCases(plainPath: string, outPath: string): Promise<void> {
  const { cases, counts } = buildConsentCases(await readJSONLines(plainPath, plainRecordSchema));

  await writeFile(outPath, cases.map((consentCase) => `${JSON.stringify(consentCase)}\n`).join(''), {
    mode: 0o600,
  });

  console.log(`turns ${counts.turns}, natural pairs ${counts.natural}, swapped pairs ${counts.swapped}`);
  console.log(
    `left out: ${counts.callsReadOnly} read-only calls, ${counts.callsWithoutMessage} calls with no owner message, ` +
      `${counts.callsUnreadable} unreadable calls, ${counts.messagesUnreadable} unreadable messages, ` +
      `${counts.messagesUnknownSpans} messages with unknown spans`,
  );

  for (const [tool, count] of Object.entries(counts.naturalByTool).toSorted((first, second) => second[1] - first[1])) {
    console.log(`  ${tool}: ${count}`);
  }
}

async function runLabelCommand(): Promise<void> {
  const outPath = requireFlag(values.out, '--out');
  const persona = await Bun.file(requireFlag(values.persona, '--persona')).text();
  const template = await Bun.file(new URL('label-prompt.txt', import.meta.url)).text();
  const systemPrompt = template.replace('{{persona}}', persona.trim());
  const cases = await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema);
  const records = await readJSONLines(requireFlag(values.plain, '--plain'), plainRecordSchema);
  const env = await buildModelEnv();
  // The CLI's schema validator knows no draft 2020-12 meta-schema, so the key that names it goes.
  const { $schema: _, ...schema } = z.toJSONSchema(labellerOutputSchema);
  const outputFormat = { type: 'json_schema' as const, schema };

  const result = await runLabels({
    turns: buildLabelTurns(records, cases),
    done: existsSync(outPath) ? await readJSONLines(outPath, labelRecordSchema) : [],
    outPath,
    profile: buildProfile(labellerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readSpentUSD(values.checks, checkRecordSchema),
    ...buildRunLimits(),
    // The check guest's own query, with the labeller's answer shape in place of the verdict.
    runLabel: (request) =>
      runCheckQuery(request, {
        env,
        runQuery: (params) => query({ ...params, options: { ...params.options, outputFormat } }),
      }),
  });

  console.log(
    `labelled ${result.ran} turns, skipped ${result.skipped}, spent $${result.costUSD.toFixed(4)} in total` +
      (result.isStoppedAtBudget ? `, stopped at the $${values.budget} budget` : '') +
      (result.isStoppedByFailure ? ', stopped because a call got no answer from the model API' : ''),
  );
}

async function runCheckCommand(): Promise<void> {
  const outPath = requireFlag(values.out, '--out');
  const systemPrompt = await Bun.file(new URL('prompt.txt', import.meta.url)).text();
  const env = await buildModelEnv();

  const result = await runChecks({
    cases: await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema),
    done: existsSync(outPath) ? await readJSONLines(outPath, checkRecordSchema) : [],
    outPath,
    profile: buildProfile(checkerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readSpentUSD(values.labels, labelRecordSchema),
    ...buildRunLimits(),
    runCheck: (request) => runCheckQuery(request, { env }),
  });

  console.log(
    `checked ${result.ran} pairs, skipped ${result.skipped}, spent $${result.costUSD.toFixed(4)} in total` +
      (result.isStoppedAtBudget ? `, stopped at the $${values.budget} budget` : '') +
      (result.isStoppedByFailure ? ', stopped because a call got no answer from the model API' : ''),
  );
}

async function buildModelEnv(): Promise<Record<string, string | undefined>> {
  const token = process.env['ANTHROPIC_AUTH_TOKEN'];

  if (token === undefined || token === '') {
    throw new Error('set ANTHROPIC_AUTH_TOKEN to the model credential');
  }

  const home = requireFlag(values.home, '--home');

  await mkdir(home, { recursive: true, mode: 0o700 });

  return { PATH: process.env['PATH'], HOME: home, ANTHROPIC_AUTH_TOKEN: token };
}

function buildProfile(defaults: { model: string; effort: string }) {
  return {
    model: values.model ?? defaults.model,
    baseURL: 'https://api.anthropic.com',
    effort: effortSchema.parse(values.effort ?? defaults.effort),
    authHeader: 'bearer' as const,
  };
}

function buildRunLimits() {
  return {
    budgetUSD: Number(values.budget),
    limit: values.limit === undefined ? null : Number(values.limit),
    concurrency: Number(values.concurrency),
  };
}

async function readSpentUSD(
  path: string | undefined,
  schema: typeof checkRecordSchema | typeof labelRecordSchema,
): Promise<number> {
  if (path === undefined || !existsSync(path)) {
    return 0;
  }

  const records: { costUSD: number }[] = await readJSONLines(path, schema);

  return records.reduce((sum, record) => sum + record.costUSD, 0);
}

async function printScore(): Promise<void> {
  const cases = await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema);
  const labelRecords = await readJSONLines(requireFlag(values.labels, '--labels'), labelRecordSchema);
  const { labels, unsure } = buildLabels(cases, labelRecords);
  const checks = await readJSONLines(requireFlag(values.checks, '--checks'), checkRecordSchema);
  const score = scoreVerdicts(checks, labels);
  const labelSpend = labelRecords.reduce((sum, record) => sum + record.costUSD, 0);

  console.log(`labeller: ${unsure} natural pairs unsure, ${labelRecords.filter((record) => record.failure !== null).length} failed turns`);

  for (const bucket of score.buckets) {
    console.log(
      `${bucket.bucket}: asked ${bucket.asked}, not asked ${bucket.notAsked}, unlabelled ${bucket.unlabelled}, failed checks ${bucket.failed}`,
    );
    console.log(`  miss rate ${formatRate(bucket.missed)}`);
    console.log(`  wrong-credit rate ${formatRate(bucket.wrongCredit)}`);
  }

  const natural = checks.filter((record) => record.bucket === 'natural');

  for (const tool of [...new Set(natural.map((record) => record.tool))].toSorted()) {
    const [byTool] = scoreVerdicts(
      natural.filter((record) => record.tool === tool),
      labels,
    ).buckets;

    if (byTool !== undefined) {
      console.log(`natural ${tool}: miss ${formatRate(byTool.missed)}, wrong credit ${formatRate(byTool.wrongCredit)}`);
    }
  }

  console.log(
    `spend: labeller $${labelSpend.toFixed(4)}, checker $${score.costUSD.toFixed(4)}, total $${(labelSpend + score.costUSD).toFixed(4)}`,
  );
}

function formatRate(rate: Rate): string {
  const share = rate.rate === null ? 'none' : rate.rate.toFixed(3);

  return `${share} (${rate.count} of ${rate.of}, 95% interval ${rate.low.toFixed(3)} to ${rate.high.toFixed(3)})`;
}
