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
        ].join('\n'),
      ),
  };
}

test('it writes the override for the day in force in the config zone, which may pass the cap', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  // 23:30Z in summer is already the next day in London
  const written = await runRaise({
    configPath: ctx.configPath,
    period: 'day',
    dollars: 200,
    tokens: 250_000_000,
    now: () => Date.parse('2026-06-13T23:30:00Z'),
  });

  expect(written).toStrictEqual({
    period: 'day',
    start: '2026-06-14',
    limit: { dollars: 200, tokens: 250_000_000 },
  });

  const read = await readOverride(ctx.overridePath);

  expect(read).toStrictEqual({ kind: 'found', override: written });
});

test('it writes the override for the month in force as its first day', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  const written = await runRaise({
    configPath: ctx.configPath,
    period: 'month',
    dollars: 2000,
    tokens: 2_000_000_000,
    now: () => Date.parse('2026-11-17T10:00:00Z'),
  });

  expect(written.start).toBe('2026-11-01');
});

test('it leaves no part file behind', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  await runRaise({
    configPath: ctx.configPath,
    period: 'day',
    dollars: 1,
    tokens: 1,
    now: () => Date.parse('2026-11-17T10:00:00Z'),
  });

  const partExists = await Bun.file(`${ctx.overridePath}.part`).exists();

  expect(partExists).toBeFalse();
});

test('it refuses a config that names no override file', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(null));

  await expect(
    runRaise({
      configPath: ctx.configPath,
      period: 'day',
      dollars: 1,
      tokens: 1,
      now: Date.now,
    }),
  ).rejects.toThrow(/override/u);
});

test('it refuses a config with limits, which has no period to raise', async () => {
  const ctx = await setupTest();

  await ctx.writeConfig(['limits: { dollars: 5 }']);

  await expect(
    runRaise({
      configPath: ctx.configPath,
      period: 'day',
      dollars: 1,
      tokens: 1,
      now: Date.now,
    }),
  ).rejects.toThrow(/periods/u);
});

test.each([
  ['a dollar limit of zero', 0, 1],
  ['a negative dollar limit', -5, 1],
  ['a token limit that is not a number', 1, Number.NaN],
])('it refuses %s and writes no override', async (_name, dollars, tokens) => {
  const ctx = await setupTest();

  await ctx.writeConfig(ctx.periodsLines(ctx.overridePath));

  await expect(
    runRaise({ configPath: ctx.configPath, period: 'day', dollars, tokens, now: Date.now }),
  ).rejects.toThrow();

  const written = await Bun.file(ctx.overridePath).exists();

  expect(written).toBeFalse();
});
