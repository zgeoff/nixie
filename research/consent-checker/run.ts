// Measures the consent checker on a deployment's own messages. Each command reads and writes files
// outside the repo, because they hold the user's own messages, and prints counts and rates only.
//
//   bun run.ts cases --plain <records.jsonl> --out <cases.jsonl>
//   bun run.ts check --cases <cases.jsonl> --out <checks.jsonl> --home <dir> [--model <id>]
//     [--effort <level>] [--budget <usd>] [--concurrency <n>]
//   bun run.ts score --checks <checks.jsonl> --labels <labels.jsonl>
//
// `check` reads the model credential from ANTHROPIC_AUTH_TOKEN and sends it as a bearer token, as a
// deployment's checker profile does.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { runCheckQuery } from '../../guests/conversation/src/run-check-query.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { plainRecordSchema } from '../memory-retrieval/real-turns/read-plain-export.ts';
// @boundaries-ignore the spike reads the export the retrieval spike reads
import { readJSONLines } from '../memory-retrieval/real-turns/read-json-lines.ts';
import { buildConsentCases } from './consent/build-consent-cases.ts';
import { runChecks } from './consent/run-checks.ts';
import { scoreVerdicts } from './consent/score-verdicts.ts';
import type { Rate } from './consent/score-verdicts.ts';
import { checkRecordSchema, consentCaseSchema, labelSchema } from './consent/types.ts';

const effortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    plain: { type: 'string' },
    cases: { type: 'string' },
    checks: { type: 'string' },
    labels: { type: 'string' },
    out: { type: 'string' },
    home: { type: 'string' },
    // The checker role's profile in the deployment this spike measures.
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    effort: { type: 'string', default: 'high' },
    budget: { type: 'string', default: '4' },
    concurrency: { type: 'string', default: '2' },
  },
});

const command = positionals[0];

if (command === 'cases') {
  await writeCases(requireFlag(values.plain, '--plain'), requireFlag(values.out, '--out'));
} else if (command === 'check') {
  await runCheckCommand();
} else if (command === 'score') {
  await printScore(requireFlag(values.checks, '--checks'), requireFlag(values.labels, '--labels'));
} else {
  throw new Error(`unknown command ${command ?? '(none)'}; pass cases, check or score`);
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

  console.log(
    `turns ${counts.turns}, natural pairs ${counts.natural}, swapped pairs ${counts.swapped}`,
  );
  console.log(
    `left out: ${counts.callsReadOnly} read-only calls, ${counts.callsWithoutMessage} calls with no owner message, ` +
      `${counts.callsUnreadable} unreadable calls, ${counts.messagesUnreadable} unreadable messages, ` +
      `${counts.messagesUnknownSpans} messages with unknown spans`,
  );

  for (const [tool, count] of Object.entries(counts.naturalByTool).toSorted((first, second) => second[1] - first[1])) {
    console.log(`  ${tool}: ${count}`);
  }
}

async function runCheckCommand(): Promise<void> {
  const token = process.env['ANTHROPIC_AUTH_TOKEN'];

  if (token === undefined || token === '') {
    throw new Error('set ANTHROPIC_AUTH_TOKEN to the model credential');
  }

  const outPath = requireFlag(values.out, '--out');
  const home = requireFlag(values.home, '--home');
  const systemPrompt = await Bun.file(new URL('prompt.txt', import.meta.url)).text();
  const env = { PATH: process.env['PATH'], HOME: home, ANTHROPIC_AUTH_TOKEN: token };

  await mkdir(home, { recursive: true, mode: 0o700 });

  const result = await runChecks({
    cases: await readJSONLines(requireFlag(values.cases, '--cases'), consentCaseSchema),
    done: existsSync(outPath) ? await readJSONLines(outPath, checkRecordSchema) : [],
    outPath,
    profile: {
      model: values.model,
      baseURL: 'https://api.anthropic.com',
      effort: effortSchema.parse(values.effort),
      authHeader: 'bearer',
    },
    systemPrompt,
    promptSHA256: createHash('sha256').update(systemPrompt).digest('hex'),
    budgetUSD: Number(values.budget),
    concurrency: Number(values.concurrency),
    runCheck: (request) => runCheckQuery(request, { env }),
  });

  console.log(
    `ran ${result.ran}, skipped ${result.skipped} already checked, spent $${result.costUSD.toFixed(4)} in total` +
      (result.isStoppedAtBudget ? `, stopped at the $${values.budget} budget` : ''),
  );
}

async function printScore(checksPath: string, labelsPath: string): Promise<void> {
  const score = scoreVerdicts(
    await readJSONLines(checksPath, checkRecordSchema),
    await readJSONLines(labelsPath, labelSchema),
  );

  for (const bucket of score.buckets) {
    console.log(
      `${bucket.bucket}: asked ${bucket.asked}, not asked ${bucket.notAsked}, unlabelled ${bucket.unlabelled}, failed calls ${bucket.failed}`,
    );
    console.log(`  miss rate ${formatRate(bucket.missed)}`);
    console.log(`  wrong-credit rate ${formatRate(bucket.wrongCredit)}`);
  }

  console.log(`spend $${score.costUSD.toFixed(4)}`);
}

function formatRate(rate: Rate): string {
  const share = rate.rate === null ? 'none' : rate.rate.toFixed(3);

  return `${share} (${rate.count} of ${rate.of}, 95% interval ${rate.low.toFixed(3)} to ${rate.high.toFixed(3)})`;
}
