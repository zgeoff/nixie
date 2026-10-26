// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
// The files each command reads and writes hold the user's own messages, so they live outside the repo
// and the commands print counts and rates only. The README gives each command and its flags.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
// oxlint-disable-next-line zgeoff/import-zones -- the spike runs the check guest's options through the SDK's query, with the labeller's answer shape in place of the verdict
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { readJSONLines } from '../memory-retrieval/real-turns/read-json-lines.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { plainRecordSchema } from '../memory-retrieval/real-turns/read-plain-export.ts';
import { buildConsentCases } from './consent/build-consent-cases.ts';
import { buildLabelTurns } from './consent/build-label-turns.ts';
import { buildLabels } from './consent/build-labels.ts';
import { createRunLock } from './consent/create-run-lock.ts';
import { nodeLockFiles } from './consent/node-lock-files.ts';
import type { QueueResult } from './consent/run-budgeted-queue.ts';
import { runChecks } from './consent/run-checks.ts';
import { runLabels } from './consent/run-labels.ts';
import { runPaidQuery } from './consent/run-paid-query.ts';
import type { Rate } from './consent/score-verdicts.ts';
import { scoreVerdicts } from './consent/score-verdicts.ts';
import {
  checkRecordSchema,
  consentCaseSchema,
  labelRecordSchema,
  labellerOutputSchema,
} from './consent/types.ts';

const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

interface RoleProfile {
  model: string;
  effort: string;
}

// The checker role's profile, and the conversation role's profile for the labeller, in the
// deployment this spike measures.
const checkerProfile: RoleProfile = { model: 'claude-sonnet-5-5', effort: 'high' };
const labellerProfile: RoleProfile = { model: 'claude-opus-5-5', effort: 'medium' };

const args = parseArgs({
  allowPositionals: true,
  options: {
    plain: { type: 'string' },
    cases: { type: 'string' },
    checks: { type: 'string' },
    labels: { type: 'string' },
    persona: { type: 'string' },
    out: { type: 'string' },
    home: { type: 'string' },
    'base-url': { type: 'string', default: 'https://api.anthropic.com' },
    model: { type: 'string' },
    effort: { type: 'string' },
    budget: { type: 'string', default: '4' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '2' },
  },
});

const values = args.values;
const [command] = args.positionals;

if (command === 'cases') {
  const outPath = requireFlag(values.out, '--out');

  await withRunLock([outPath], () => writeCases(requireFlag(values.plain, '--plain'), outPath));
} else if (command === 'label') {
  await runLabelCommand();
} else if (command === 'check') {
  await runCheckCommand();
} else if (command === 'score') {
  const paths = [
    requireFlag(values.cases, '--cases'),
    requireFlag(values.labels, '--labels'),
    requireFlag(values.checks, '--checks'),
  ];

  await withRunLock(paths, () => printScore());
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
  const records = await readJSONLines(plainPath, plainRecordSchema);

  const built = buildConsentCases(records);
  const counts = built.counts;

  await writeFile(
    outPath,
    built.cases.map((consentCase) => `${JSON.stringify(consentCase)}\n`).join(''),
    {
      mode: 0o600,
    },
  );

  console.log(
    `turns ${counts.turns}, natural pairs ${counts.natural}, swapped pairs ${counts.swapped}`,
  );

  console.log(
    `left out: ${counts.callsReadOnly} read-only calls, ${counts.callsWithoutMessage} calls with no owner message, ` +
      `${counts.callsUnreadable} unreadable calls, ${counts.messagesUnreadable} unreadable messages, ` +
      `${counts.messagesUnknownSpans} messages with unknown spans`,
  );

  for (const [tool, count] of Object.entries(counts.naturalByTool).toSorted(
    (first, second) => second[1] - first[1],
  )) {
    console.log(`  ${tool}: ${count}`);
  }
}

type RunLimits = ReturnType<typeof buildRunLimits>;

async function runLabelCommand(): Promise<void> {
  const limits = buildRunLimits();
  const outPath = requireFlag(values.out, '--out');

  await withRunLock([outPath, values.checks, values.cases], () =>
    runLabelsUnderLock(outPath, limits),
  );
}

async function runLabelsUnderLock(outPath: string, limits: RunLimits): Promise<void> {
  const persona = await Bun.file(requireFlag(values.persona, '--persona')).text();
  const template = await Bun.file(new URL('label-prompt.txt', import.meta.url)).text();

  const systemPrompt = template.replace('{{persona}}', persona.trim());

  const cases = await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema);
  const records = await readJSONLines(requireFlag(values.plain, '--plain'), plainRecordSchema);
  const env = await createModelEnv();

  // The CLI's schema validator knows no draft 2020-12 meta-schema, so the key that names it goes.
  const { $schema: _, ...schema } = z.toJSONSchema(labellerOutputSchema);
  const outputFormat = { type: 'json_schema' as const, schema };

  const result = await runLabels({
    turns: buildLabelTurns(records, cases),
    done: existsSync(outPath) ? await readJSONLines(outPath, labelRecordSchema) : [],
    appendRecord: makeAppendJSONLine(outPath),
    profile: buildProfile(labellerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readSpentUSD(values.checks, checkRecordSchema),
    ...limits,

    // The check guest's options, with the labeller's answer shape in place of the verdict.
    runLabel: (request) =>
      runPaidQuery(request, {
        env,
        runQuery: (params) => query({ ...params, options: { ...params.options, outputFormat } }),
      }),
  });

  console.log(
    `labelled ${result.ran} turns, skipped ${result.skipped}, spent $${result.costUSD.toFixed(4)} in total${
      result.isStoppedAtBudget ? `, stopped at the $${values.budget} budget` : ''
    }${formatFailureStop(result)}`,
  );
}

async function runCheckCommand(): Promise<void> {
  const limits = buildRunLimits();
  const outPath = requireFlag(values.out, '--out');

  await withRunLock([outPath, values.labels, values.cases], () =>
    runChecksUnderLock(outPath, limits),
  );
}

async function runChecksUnderLock(outPath: string, limits: RunLimits): Promise<void> {
  const systemPrompt = await Bun.file(new URL('prompt.txt', import.meta.url)).text();
  const env = await createModelEnv();

  const result = await runChecks({
    cases: await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema),
    done: existsSync(outPath) ? await readJSONLines(outPath, checkRecordSchema) : [],
    appendRecord: makeAppendJSONLine(outPath),
    profile: buildProfile(checkerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readSpentUSD(values.labels, labelRecordSchema),
    ...limits,
    runCheck: (request) => runPaidQuery(request, { env, runQuery: query }),
  });

  console.log(
    `checked ${result.ran} pairs, skipped ${result.skipped}, spent $${result.costUSD.toFixed(4)} in total${
      result.isStoppedAtBudget ? `, stopped at the $${values.budget} budget` : ''
    }${formatFailureStop(result)}`,
  );
}

// The label and check runs share one budget across both output files, so each holds both files from
// before it reads their spend and done records until it ends. Every command holds the cases file,
// which the cases command rewrites whole, so no command reads it half written.
async function withRunLock(
  paths: readonly (string | undefined)[],
  run: () => Promise<void>,
): Promise<void> {
  const lock = await createRunLock(
    paths.filter((path) => path !== undefined),
    nodeLockFiles,
  );

  try {
    await run();
  } finally {
    await lock.remove();
  }
}

function formatFailureStop(result: QueueResult): string {
  if (!result.isStoppedByFailure) {
    return '';
  }

  return `, stopped because a call got no answer from the model API (${result.failureReason ?? 'no reason given'})`;
}

function makeAppendJSONLine(path: string): (value: unknown) => Promise<void> {
  return (value) => appendFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function createModelEnv(): Promise<Record<string, string | undefined>> {
  const token = process.env['ANTHROPIC_AUTH_TOKEN'];

  if (token === undefined || token === '') {
    throw new Error('set ANTHROPIC_AUTH_TOKEN to the model credential');
  }

  const home = requireFlag(values.home, '--home');

  await mkdir(home, { recursive: true, mode: 0o700 });

  return { PATH: process.env['PATH'], HOME: home, ANTHROPIC_AUTH_TOKEN: token };
}

function buildProfile(defaults: RoleProfile) {
  return {
    model: values.model ?? defaults.model,
    baseURL: values['base-url'],
    effort: effortSchema.parse(values.effort ?? defaults.effort),
    authHeader: 'bearer' as const,
  };
}

// A flag that reads as no number, such as NaN, would turn the budget check off or start no worker.
function buildRunLimits() {
  return {
    budgetUSD: parseFlagNumber(
      '--budget',
      values.budget,
      z.coerce.number().nonnegative(),
      'a dollar amount of 0 or more',
    ),
    limit:
      values.limit === undefined
        ? null
        : parseFlagNumber(
            '--limit',
            values.limit,
            z.coerce.number().int().nonnegative(),
            'a whole number of 0 or more',
          ),
    concurrency: parseFlagNumber(
      '--concurrency',
      values.concurrency,
      z.coerce.number().int().positive(),
      'a whole number of 1 or more',
    ),
  };
}

function parseFlagNumber(
  flag: string,
  value: string | undefined,
  schema: z.ZodType<number, unknown>,
  expected: string,
): number {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`${flag} takes ${expected}, not ${value ?? '(none)'}`);
  }

  return parsed.data;
}

async function readSpentUSD(
  path: string | undefined,
  schema: typeof checkRecordSchema | typeof labelRecordSchema,
): Promise<number> {
  if (path === undefined || !existsSync(path)) {
    return 0;
  }

  const records: { costUSD: number | null }[] = await readJSONLines(path, schema);

  return records.reduce((sum, record) => sum + (record.costUSD ?? 0), 0);
}

async function printScore(): Promise<void> {
  const cases = await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema);

  const labelRecords = await readJSONLines(
    requireFlag(values.labels, '--labels'),
    labelRecordSchema,
  );

  const built = buildLabels(labelRecords);
  const labels = built.labels;

  const allChecks = await readJSONLines(requireFlag(values.checks, '--checks'), checkRecordSchema);

  const caseIDs = new Set(cases.map((consentCase) => consentCase.caseID));

  // A check of a pair that a later build of the cases dropped still counts in the spend.
  const checks = allChecks.filter((record) => caseIDs.has(record.caseID));
  const score = scoreVerdicts(checks, labels);
  const labelSpend = labelRecords.reduce((sum, record) => sum + (record.costUSD ?? 0), 0);
  const checkSpend = allChecks.reduce((sum, record) => sum + (record.costUSD ?? 0), 0);

  console.log(
    `labeller: ${built.unsure} natural pairs unsure, ${labelRecords.filter((record) => record.failure !== null).length} failed turns`,
  );

  console.log(`checks of pairs outside the cases: ${allChecks.length - checks.length}`);

  for (const bucket of score.buckets) {
    console.log(
      `${bucket.bucket}: asked ${bucket.asked}, not asked ${bucket.notAsked}, unlabelled ${bucket.unlabelled}, failed checks ${bucket.failed}`,
    );

    console.log(`  miss rate ${formatRate(bucket.missed)}`);
    console.log(`  wrong-credit rate ${formatRate(bucket.wrongCredit)}`);
    console.log(`  credited ${formatRate(bucket.credited)}`);
  }

  const natural = checks.filter((record) => record.bucket === 'natural');

  for (const tool of [...new Set(natural.map((record) => record.tool))].toSorted()) {
    const [byTool] = scoreVerdicts(
      natural.filter((record) => record.tool === tool),
      labels,
    ).buckets;

    if (byTool !== undefined) {
      console.log(
        `natural ${tool}: miss ${formatRate(byTool.missed)}, wrong credit ${formatRate(byTool.wrongCredit)}`,
      );
    }
  }

  const swapped = checks.filter((record) => record.bucket === 'swapped');

  for (const tool of [...new Set(swapped.map((record) => record.tool))].toSorted()) {
    const byTool = scoreVerdicts(
      swapped.filter((record) => record.tool === tool),
      labels,
    ).buckets.find((bucket) => bucket.bucket === 'swapped');

    if (byTool !== undefined) {
      console.log(`swapped ${tool}: credited ${formatRate(byTool.credited)}`);
    }
  }

  console.log(
    `spend: labeller $${labelSpend.toFixed(4)}, checker $${checkSpend.toFixed(4)}, total $${(labelSpend + checkSpend).toFixed(4)}`,
  );
}

function formatRate(rate: Rate): string {
  const share = rate.rate === null ? 'none' : rate.rate.toFixed(3);

  return `${share} (${rate.count} of ${rate.of}, 95% interval ${rate.low.toFixed(3)} to ${rate.high.toFixed(3)})`;
}
