import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOverride } from './read-override';
import { runRaise } from './run-raise';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-raise-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const configPath = join(directory, 'proxy.yaml');
  const overridePath = join(directory, 'override.json');

  return {
    nowMs: Date.parse('2026-11-17T10:00:00Z'),
    directory,
    configPath,
    periodsLines: (overrideFile: string | null): string[] => [
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
      ...(overrideFile === null ? [] : [`override: ${overrideFile}`]),
    ],
    overridePath,
    writeConfig: (periodsLines: readonly string[]) =>
      writeFile(
        configPath,
        [
          'listen: { port: 0 }',
          `store: ${join(directory, 'counter.json')}`,
          ...periodsLines,
          'routes:',
          '  preview:',
          '    upstream: http://model.test',
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '    limits: { day: 40, month: 600 }',
          '  bare:',
          '    upstream: http://model.test',
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '  other:',
          '    upstream: http://model.test',
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '    limits: { day: 5, month: 50 }',
        ].join('\n'),
      ),
  };
}

test('it writes the override for the route and the day in force in the config zone, which may pass the cap', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  // 23:30Z in summer is already the next day in London
  const written = await runRaise({
    configPath: ctx.configPath,
    route: 'preview',
    dollars: 200,
    now: () => Date.parse('2026-06-13T23:30:00Z'),
  });

  expect(written).toStrictEqual({ start: '2026-06-14', dollars: 200 });

  const read = await readOverride(ctx.overridePath);

  expect(read).toStrictEqual({ kind: 'found', overrides: { preview: written } });
});

test('it keeps the override of another route when it writes one', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  const now = () => ctx.nowMs;

  const first = await runRaise({ configPath: ctx.configPath, route: 'preview', dollars: 200, now });
  const second = await runRaise({ configPath: ctx.configPath, route: 'other', dollars: 9, now });
  const read = await readOverride(ctx.overridePath);

  expect(read).toStrictEqual({ kind: 'found', overrides: { preview: first, other: second } });
});

test('it keeps both overrides when two processes raise different routes at once', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  const script = [
    "const { runRaise } = await import(Bun.env['RAISE_MODULE'] ?? '');",
    "await runRaise({ configPath: Bun.env['RAISE_CONFIG'] ?? '', route: Bun.env['RAISE_ROUTE'] ?? '', dollars: 9, now: () => Number(Bun.env['RAISE_NOW']) });",
  ].join('\n');

  const spawnRaise = (route: string) =>
    Bun.spawn(['bun', '-e', script], {
      env: {
        ...Bun.env,
        RAISE_MODULE: join(import.meta.dir, 'run-raise.ts'),
        RAISE_CONFIG: ctx.configPath,
        RAISE_ROUTE: route,
        RAISE_NOW: String(ctx.nowMs),
      },
      stderr: 'pipe',
    });

  const kept: string[] = [];

  for (let trial = 0; trial < 6; trial += 1) {
    await rm(ctx.overridePath, { force: true });

    const exits = await Promise.all(
      [spawnRaise('preview'), spawnRaise('other')].map((child) => child.exited),
    );

    const read = await readOverride(ctx.overridePath);

    kept.push(
      `${exits.join('')}:${read.kind === 'found' ? Object.keys(read.overrides).toSorted().join(',') : ''}`,
    );
  }

  expect(kept).toSatisfyAll((trial) => trial === '00:other,preview');
});

test('it leaves no part file behind', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  await runRaise({
    configPath: ctx.configPath,
    route: 'preview',
    dollars: 1,
    now: () => Date.parse('2026-11-17T10:00:00Z'),
  });

  const partExists = await Bun.file(`${ctx.overridePath}.part`).exists();

  expect(partExists).toBeFalse();
});

test('it refuses a config that names no override file', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(null));

  expect(
    runRaise({ configPath: ctx.configPath, route: 'preview', dollars: 1, now: Date.now }),
  ).rejects.toThrow(/override/u);
});

test('it refuses a config with a limit that spans routes, which has no route to raise', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(['limits: { dollars: 5 }', ...ctx.periodsLines(ctx.overridePath)]);

  expect(
    runRaise({ configPath: ctx.configPath, route: 'preview', dollars: 1, now: Date.now }),
  ).rejects.toThrow(/no limit spans routes/u);
});

test.each([
  ['a route the config does not name', 'ghost', 1],
  ['a route with no limits', 'bare', 1],
  ['a dollar limit of zero', 'preview', 0],
  ['a negative dollar limit', 'preview', -5],
  ['a dollar limit that is not a number', 'preview', Number.NaN],
])('it refuses %s and writes no override', async (_name, route, dollars) => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  expect(runRaise({ configPath: ctx.configPath, route, dollars, now: Date.now })).rejects.toThrow();

  const written = await Bun.file(ctx.overridePath).exists();

  expect(written).toBeFalse();
});
