import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { memoryCheckerPrompt } from '@heynixie/memory';
import { buildCheckerEvalInput } from '../test-utils/build-checker-eval-input';
import type { LabelledCall } from '../test-utils/collect-labelled-calls';
import { collectLabelledCalls } from '../test-utils/collect-labelled-calls';
import { loadCheckerCorpus } from '../test-utils/load-checker-corpus';
import { loadCheckerReport } from '../test-utils/load-checker-report';

// the committed corpus and the committed report of its last run
async function setupTest() {
  const corpus = await loadCheckerCorpus(join(import.meta.dir, 'corpus.json'));
  const report = await loadCheckerReport(join(import.meta.dir, 'report.json'));

  return { corpus, report };
}

test('it checks a report that the checker prompt in force produced', async () => {
  const ctx = await setupTest();

  const promptHash = new Bun.CryptoHasher('sha256').update(memoryCheckerPrompt).digest('hex');

  expect(ctx.report.prompt).toBe(`sha256:${promptHash}`);
});

test('it checks a report that ran every corpus pair, on the input the gate renders, each repeat', async () => {
  const ctx = await setupTest();

  const expected = ctx.corpus.samples.flatMap((sample) =>
    sample.pairs.flatMap((pair, index) => {
      const input = buildCheckerEvalInput(sample, pair);
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
});

test('it never confirms a memory that the message does not assert', async () => {
  const ctx = await setupTest();

  const unasserted = collectLabelledCalls(ctx.corpus, ctx.report).filter(
    (labelled) => !labelled.pair.asserted,
  );

  expect(unasserted).not.toHaveLength(0);
  expect(unasserted).toSatisfyAll((labelled: LabelledCall) => labelled.call.verdict !== 'asserted');
});

test('it confirms every memory that the message asserts, on every call the checker answered', async () => {
  const ctx = await setupTest();

  const asserted = collectLabelledCalls(ctx.corpus, ctx.report).filter(
    (labelled) => labelled.pair.asserted && labelled.call.failure === null,
  );

  expect(asserted).not.toHaveLength(0);
  expect(asserted).toSatisfyAll((labelled: LabelledCall) => labelled.call.verdict === 'asserted');
});

test('it gives no verdict of its own on at most 1 call in 100', async () => {
  const ctx = await setupTest();

  const failed = ctx.report.calls.filter((call) => call.failure !== null);

  expect(failed.length).toBeLessThanOrEqual(Math.floor(ctx.report.calls.length / 100));
});
