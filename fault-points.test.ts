import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Bundles the tasks and actions packages, every export kept, the way the release build does, with
// NIXIE_TEST_BUILD defined as the build says, and returns the bundle's text.
async function setupTest(isTestBuild: boolean) {
  const outdir = await mkdtemp(join(tmpdir(), 'nixie-fault-points-'));

  onTestFinished(() => rm(outdir, { recursive: true, force: true }));

  const result = await Bun.build({
    entrypoints: [
      join(import.meta.dir, 'modules/tasks/src/index.ts'),
      join(import.meta.dir, 'modules/actions/src/index.ts'),
    ],
    outdir,
    target: 'bun',
    define: { NIXIE_TEST_BUILD: String(isTestBuild) },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'the bundle failed');
  }
  const texts = await Promise.all(result.outputs.map((output) => output.text()));

  return { bundle: texts.join('\n') };
}

// every slice 1 fault point in the crash tests design, except trigger.deliver.before, whose trigger
// source arrives in slice 6; recovery.step.<n> is one template over the 5 recovery steps
const sliceOneFaultPoints = [
  'claim.after',
  'renew.before',
  'renew.after',
  'step.commit.before',
  'step.commit.after',
  'queue.commit.before',
  'queue.commit.after',
  'attempt.record.after',
  'attempt.result.before',
  'attempt.result.after',
  'timer.fire.before',
  'inbox.write.after',
  'recovery.step.',
  'sigterm.grace',
];

test('a test build holds every slice 1 fault point', async () => {
  const ctx = await setupTest(true);

  expect(sliceOneFaultPoints.filter((id) => !ctx.bundle.includes(id))).toStrictEqual([]);
});

test('the release bundle holds no fault point', async () => {
  const ctx = await setupTest(false);

  expect(sliceOneFaultPoints.filter((id) => ctx.bundle.includes(id))).toStrictEqual([]);
});
