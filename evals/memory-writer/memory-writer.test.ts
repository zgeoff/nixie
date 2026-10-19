import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildWriterTools, createWriterStaging } from '@heynixie/memory';
import { buildWriterEvalInput } from '../test-utils/build-writer-eval-input';
import { checkWriterRule } from '../test-utils/check-writer-rule';
import { loadWriterCases } from '../test-utils/load-writer-cases';
import type { WriterCall } from '../test-utils/load-writer-report';
import { loadWriterReport } from '../test-utils/load-writer-report';

// the committed cases, the committed report of their last run, and the production writer tools
async function setupTest() {
  const cases = await loadWriterCases(join(import.meta.dir, 'cases.json'));
  const report = await loadWriterReport(join(import.meta.dir, 'report.json'));

  const tools = buildWriterTools(
    { recall: () => Promise.resolve({ items: [], next: null }) },
    createWriterStaging(),
    5,
  ).map((tool) => ({ name: tool.name, description: tool.description, input: tool.input }));

  return { cases, report, tools };
}

test('it checks a report that ran every case, each repeat, on the prompts and tools in force', async () => {
  const ctx = await setupTest();

  const expected = ctx.cases.cases.flatMap((writerCase) =>
    Array.from({ length: ctx.report.repeats }, (_, repeat) => ({
      case: writerCase.id,
      repeat,
      input: buildWriterEvalInput(ctx.cases, writerCase, ctx.tools).hash,
    })),
  );

  const ran = ctx.report.calls.map((call) => ({
    case: call.case,
    repeat: call.repeat,
    input: call.input,
  }));

  expect(ran).toIncludeSameMembers(expected);
});

test('it checks a report in which every run finished', async () => {
  const ctx = await setupTest();

  expect(ctx.report.calls).toSatisfyAll((call: WriterCall) => call.failure === null);
});

test("it meets each case's rule on every run", async () => {
  const ctx = await setupTest();

  const rules = new Map(ctx.cases.cases.map((writerCase) => [writerCase.id, writerCase]));

  const findings = ctx.report.calls.map((call) => {
    const writerCase = rules.get(call.case);

    return {
      case: call.case,
      repeat: call.repeat,
      finding:
        writerCase === undefined
          ? 'the case is not in the corpus'
          : checkWriterRule(writerCase, call),
    };
  });

  expect(findings).toSatisfyAll((entry: (typeof findings)[number]) => entry.finding === null);
});
