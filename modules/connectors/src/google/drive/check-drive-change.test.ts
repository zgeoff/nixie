import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const check = (tool: string, args: Record<string, unknown>) => {
    const queued = ctx.findAction(tool).queued;

    invariant(queued?.check, `${tool} has a check`);

    return queued.check({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool,
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations: [],
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  return { ...ctx, check };
}

test('it finds a created file on a later page of the marker search after a page with no file', async () => {
  const ctx = await setupTest();

  ctx.site.drive.emptyListPages = 2;

  const seeded = ctx.site.drive.seed({
    name: 'Plan',
    text: 'x',
    appProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
  });

  const outcome = await ctx.check('drive.create', { name: 'Plan', text: 'x', as: 'text' });

  expect(outcome).toMatchObject({ kind: 'found', result: { file: `k3x9m2p7qa.${seeded.id}` } });
});

test('it finds a created file on a page after more than 10 pages with no file', async () => {
  const ctx = await setupTest();

  ctx.site.drive.emptyListPages = 12;

  const seeded = ctx.site.drive.seed({
    name: 'Plan',
    text: 'x',
    appProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
  });

  const outcome = await ctx.check('drive.create', { name: 'Plan', text: 'x', as: 'text' });

  expect(outcome).toMatchObject({ kind: 'found', result: { file: `k3x9m2p7qa.${seeded.id}` } });
});

test('it finds a created file by the marker in its app properties', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({
    name: 'Plan',
    text: 'x',
    appProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
  });

  const outcome = await ctx.check('drive.create', { name: 'Plan', text: 'x', as: 'text' });

  expect(outcome).toMatchObject({ kind: 'found', result: { file: `k3x9m2p7qa.${seeded.id}` } });
});

test('it answers not found for a create when no file holds the marker', async () => {
  const ctx = await setupTest();

  ctx.site.drive.seed({ name: 'Plan', text: 'x' });

  const outcome = await ctx.check('drive.create', { name: 'Plan', text: 'x', as: 'text' });

  expect(outcome).toStrictEqual({ kind: 'not_found' });
});

test('it answers inconclusive for a create when the search fails', async () => {
  const ctx = await setupTest();

  ctx.site.drive.failures.push({ line: 'GET /drive/v3/files', status: 500 });

  const outcome = await ctx.check('drive.create', { name: 'Plan', text: 'x', as: 'text' });

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test.each([
  {
    title: 'holds the marker',
    properties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
    expected: 'found',
  },
  { title: 'lacks it with fewer than 10 markers', properties: {}, expected: 'not_found' },
  {
    title: 'lacks it with 10 other markers',
    properties: Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`nixie${String(index).padStart(32, '0')}`, '1']),
    ),
    expected: 'inconclusive',
  },
])('it answers $expected for a change when the file $title', async (row) => {
  const ctx = await setupTest();

  const seeded = ctx.site.drive.seed({ name: 'Plan', text: 'x', appProperties: row.properties });

  const outcome = await ctx.check('drive.change', {
    file: `k3x9m2p7qa.${seeded.id}`,
    name: null,
    text: 'y',
  });

  expect(outcome.kind).toBe(row.expected);
});

test('it answers inconclusive for a change when the file is gone', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.check('drive.change', {
    file: 'k3x9m2p7qa.gone',
    name: null,
    text: 'y',
  });

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});
