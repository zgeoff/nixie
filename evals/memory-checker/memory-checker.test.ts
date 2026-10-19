import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { renderMemoryCheckerPrompt } from '@heynixie/memory';
import { buildCheckerEvalInput } from '../test-utils/build-checker-eval-input';
import type { LabelledCall } from '../test-utils/collect-labelled-calls';
import { collectLabelledCalls } from '../test-utils/collect-labelled-calls';
import { loadCheckerCorpus } from '../test-utils/load-checker-corpus';
import { loadCheckerReport } from '../test-utils/load-checker-report';

interface SetupConfig {
  // the corpus file's name, which names its report too
  readonly name:
    | 'corpus'
    | 'held-out-1'
    | 'held-out-2'
    | 'held-out-3'
    | 'held-out-4'
    | 'held-out-5'
    | 'subjects';
}

// a committed corpus and the committed report of its last run
async function setupTest(config: SetupConfig) {
  const corpus = await loadCheckerCorpus(join(import.meta.dir, `${config.name}.json`));
  const report = await loadCheckerReport(join(import.meta.dir, `${config.name}-report.json`));

  return { corpus, report };
}

test.each([
  'corpus',
  'held-out-1',
  'held-out-2',
  'held-out-3',
  'held-out-4',
  'held-out-5',
  'subjects',
] as const)('it checks a %s report that the checker prompt in force produced', async (name) => {
  const ctx = await setupTest({ name });

  const promptHash = new Bun.CryptoHasher('sha256')
    .update(renderMemoryCheckerPrompt(ctx.report.ownerName))
    .digest('hex');

  expect(ctx.report.prompt).toBe(`sha256:${promptHash}`);
});

test.each([
  'corpus',
  'held-out-1',
  'held-out-2',
  'held-out-3',
  'held-out-4',
  'held-out-5',
  'subjects',
] as const)(
  'it checks a %s report that ran every pair, on the input the gate renders, each repeat',
  async (name) => {
    const ctx = await setupTest({ name });

    const expected = ctx.corpus.samples.flatMap((sample) =>
      sample.pairs.flatMap((pair, index) => {
        const input = buildCheckerEvalInput(sample, pair, ctx.report.ownerName);

        const inputHash = new Bun.CryptoHasher('sha256').update(input).digest('hex');

        return Array.from({ length: ctx.report.repeats }, (_, repeat) => ({
          sample: sample.id,
          pair: index,
          repeat,
          input: `sha256:${inputHash}`,
        }));
      }),
    );

    const ran = ctx.report.calls.map((call) => ({
      sample: call.sample,
      pair: call.pair,
      repeat: call.repeat,
      input: call.input,
    }));

    expect(ran).toIncludeSameMembers(expected);
  },
);

test.each([
  'corpus',
  'held-out-1',
  'held-out-2',
  'held-out-3',
  'held-out-4',
  'held-out-5',
  'subjects',
] as const)('it never confirms a memory that a %s message does not assert', async (name) => {
  const ctx = await setupTest({ name });

  const unasserted = collectLabelledCalls(ctx.corpus, ctx.report).filter(
    (labelled) => !labelled.pair.asserted,
  );

  expect(unasserted).not.toHaveLength(0);
  expect(unasserted).toSatisfyAll((labelled: LabelledCall) => labelled.call.verdict !== 'asserted');
});

test.each(['corpus', 'held-out-1', 'held-out-2', 'subjects'] as const)(
  'it confirms every memory that a %s message asserts, on every call the checker answered',
  async (name) => {
    const ctx = await setupTest({ name });

    const asserted = collectLabelledCalls(ctx.corpus, ctx.report).filter(
      (labelled) => labelled.pair.asserted && labelled.call.failure === null,
    );

    expect(asserted).not.toHaveLength(0);
    expect(asserted).toSatisfyAll((labelled: LabelledCall) => labelled.call.verdict === 'asserted');
  },
);

test('it gives no verdict of its own on at most 1 call in 100', async () => {
  const ctx = await setupTest({ name: 'corpus' });

  const failed = ctx.report.calls.filter((call) => call.failure !== null);

  expect(failed.length).toBeLessThanOrEqual(Math.floor(ctx.report.calls.length / 100));
});
