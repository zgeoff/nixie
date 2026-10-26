// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
// The files each command reads and writes hold the user's own messages, so they live outside the repo
// and the commands print counts and rates only. The README gives each command and its flags.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, truncate, writeFile } from 'node:fs/promises';
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
import { buildLedger } from './consent/build-ledger.ts';
import { createRunLock } from './consent/create-run-lock.ts';
import { ledgerKeys } from './consent/ledger-keys.ts';
import { nodeLockFiles } from './consent/node-lock-files.ts';
import { pickTailRepair } from './consent/pick-tail-repair.ts';
import { renderScoreReport } from './consent/render-score-report.ts';
import type { QueueResult } from './consent/run-budgeted-queue.ts';
import { runChecks } from './consent/run-checks.ts';
import { runLabels } from './consent/run-labels.ts';
import { runPaidQuery } from './consent/run-paid-query.ts';
import {
  checkLineSchema,
  consentCaseSchema,
  labelLineSchema,
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
    reserve: { type: 'string' },
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
  await writeTailRepairs([outPath, values.checks]);

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
    done: existsSync(outPath) ? await readJSONLines(outPath, labelLineSchema) : [],
    appendReservation: makeAppendJSONLine(outPath),
    appendSettlement: makeAppendJSONLine(outPath),
    appendRecord: makeAppendJSONLine(outPath),
    profile: buildProfile(labellerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readCheckSpentUSD(values.checks),
    ...limits,

    // The check guest's options, with the labeller's answer shape in place of the verdict.
    runLabel: (request) =>
      runPaidQuery(request, {
        env,
        runQuery: (params) => query({ ...params, options: { ...params.options, outputFormat } }),
        createDirectory,
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
  await writeTailRepairs([outPath, values.labels]);

  const systemPrompt = await Bun.file(new URL('prompt.txt', import.meta.url)).text();
  const env = await createModelEnv();

  const result = await runChecks({
    cases: await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema),
    done: existsSync(outPath) ? await readJSONLines(outPath, checkLineSchema) : [],
    appendReservation: makeAppendJSONLine(outPath),
    appendSettlement: makeAppendJSONLine(outPath),
    appendRecord: makeAppendJSONLine(outPath),
    profile: buildProfile(checkerProfile),
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    otherSpentUSD: await readLabelSpentUSD(values.labels),
    ...limits,
    runCheck: (request) => runPaidQuery(request, { env, runQuery: query, createDirectory }),
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

// A crash part way through an append leaves a torn last line, which the line reader refuses, so each
// command repairs the appended files it holds before it reads them.
async function writeTailRepairs(paths: readonly (string | undefined)[]): Promise<void> {
  for (const path of paths) {
    if (path === undefined || !existsSync(path)) {
      continue;
    }

    const text = await Bun.file(path).text();

    const repair = pickTailRepair(text);

    if (repair.kind === 'add_newline') {
      await appendFile(path, '\n');
    } else if (repair.kind === 'cut') {
      await truncate(path, repair.keptBytes);

      console.log('cut a torn last line from an output file');
    }
  }
}

async function createDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
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
    reserveUSD:
      values.reserve === undefined
        ? null
        : parseFlagNumber(
            '--reserve',
            values.reserve,
            z.coerce.number().positive(),
            'a dollar amount above 0',
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

async function readLabelSpentUSD(path: string | undefined): Promise<number> {
  if (path === undefined || !existsSync(path)) {
    return 0;
  }

  const lines = await readJSONLines(path, labelLineSchema);

  return buildLedger(lines, ledgerKeys.label).spentUSD;
}

async function readCheckSpentUSD(path: string | undefined): Promise<number> {
  if (path === undefined || !existsSync(path)) {
    return 0;
  }

  const lines = await readJSONLines(path, checkLineSchema);

  return buildLedger(lines, ledgerKeys.check).spentUSD;
}

async function printScore(): Promise<void> {
  await writeTailRepairs([values.labels, values.checks]);

  const cases = await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema);
  const records = await readJSONLines(requireFlag(values.plain, '--plain'), plainRecordSchema);
  const labelLines = await readJSONLines(requireFlag(values.labels, '--labels'), labelLineSchema);
  const checkLines = await readJSONLines(requireFlag(values.checks, '--checks'), checkLineSchema);

  console.log(
    renderScoreReport({
      cases,
      turns: buildLabelTurns(records, cases),
      labelLines,
      checkLines,
    }),
  );
}
