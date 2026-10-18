import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildWriterTools, createWriterStaging } from '@heynixie/memory';
import { buildWriterEvalInput } from '../test-utils/build-writer-eval-input';
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

test.each([
  ['plain-owner-fact', 'owner'],
  ['nickname-shared', 'shared'],
] as const)('it passes %s: every run files a new %s item', async (id, subject) => {
  const ctx = await setupTest();

  const runs = ctx.report.calls.filter((call) => call.case === id);

  expect(runs).toHaveLength(ctx.report.repeats);

  expect(runs).toSatisfyAll((call: WriterCall) =>
    call.writes.some(
      (write) => write.op === 'remember' && write.itemID === null && write.subject === subject,
    ),
  );
});

test('it passes deal-correction: every run edits the deal and adds no item', async () => {
  const ctx = await setupTest();

  const runs = ctx.report.calls.filter((call) => call.case === 'deal-correction');

  expect(runs).toHaveLength(ctx.report.repeats);

  expect(runs).toSatisfyAll(
    (call: WriterCall) =>
      call.writes.some(
        (write) =>
          write.op === 'remember' && write.itemID === 'item-practice' && write.subject === 'shared',
      ) && call.writes.every((write) => write.itemID !== null),
  );
});

test.each(['mixed-item', 'assistant-taste'])(
  'it passes %s: every run flags a possible self-note and writes nothing',
  async (id) => {
    const ctx = await setupTest();

    const runs = ctx.report.calls.filter((call) => call.case === id);

    expect(runs).toHaveLength(ctx.report.repeats);

    expect(runs).toSatisfyAll(
      (call: WriterCall) => call.writes.length === 0 && call.flags.length > 0,
    );
  },
);

test.each(['flip-persona-check-in', 'flip-human-like'])(
  'it passes %s: no run files an owner item',
  async (id) => {
    const ctx = await setupTest();

    const runs = ctx.report.calls.filter((call) => call.case === id);

    expect(runs).toHaveLength(ctx.report.repeats);

    expect(runs).toSatisfyAll((call: WriterCall) =>
      call.writes.every((write) => write.subject !== 'owner'),
    );
  },
);

test('it passes nickname-assistant-only: no run writes or flags anything', async () => {
  const ctx = await setupTest();

  const runs = ctx.report.calls.filter((call) => call.case === 'nickname-assistant-only');

  expect(runs).toHaveLength(ctx.report.repeats);

  expect(runs).toSatisfyAll(
    (call: WriterCall) => call.writes.length === 0 && call.flags.length === 0,
  );
});
