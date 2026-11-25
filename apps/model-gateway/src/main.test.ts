import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  await writeFile(join(directory, 'token'), 'control-secret\n');

  return {
    directory,
    model,
    entry: join(import.meta.dir, 'main.ts'),

    // the keys that every config sets before its routes
    periodsLines: [
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
    ],
  };
}

test('it serves the routes of its config until SIGINT, then exits 0', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'from the cli', usage: { input_tokens: 600, output_tokens: 400 } });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsLines,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const child = Bun.spawn(
    [process.execPath, ctx.entry, '--config', join(ctx.directory, 'proxy.yaml')],
    { stdin: 'ignore', stdout: Bun.file(join(ctx.directory, 'stdout.log')), stderr: 'inherit' },
  );

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  await waitForCondition(async () => {
    const written = await readFile(join(ctx.directory, 'stdout.log'), 'utf8').catch(() => '');

    return written.includes('proxy.started');
  });

  const written = await readFile(join(ctx.directory, 'stdout.log'), 'utf8');

  const port = /"port":(?<port>\d+)/u.exec(written)?.groups?.['port'];

  const response = await fetch(`http://127.0.0.1:${String(port)}/preview/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-small', messages: [] }),
  });

  child.kill('SIGINT');

  const code = await child.exited;
  const stored: unknown = await Bun.file(join(ctx.directory, 'counter.json')).json();

  expect(response.status).toBe(200);
  expect(code).toBe(0);

  expect(stored).toMatchObject({
    routes: { preview: { day: { dollars: 0.0026 }, month: { dollars: 0.0026 } } },
  });
});

test('it exits 1 for a config with a limit that spans routes', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'limits: { dollars: 1 }',
      ...ctx.periodsLines,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
    ].join('\n'),
  );

  const child = Bun.spawn(
    [process.execPath, ctx.entry, '--config', join(ctx.directory, 'proxy.yaml')],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
  );

  const code = await child.exited;

  expect(code).toBe(1);
});

test('it writes the override for the route and the day in force from the raise command and exits 0', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(ctx.directory, 'token')} }`,
      `override: ${join(ctx.directory, 'override.json')}`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 40, month: 600 }',
    ].join('\n'),
  );

  const child = Bun.spawn(
    [
      process.execPath,
      ctx.entry,
      'raise',
      '--config',
      join(ctx.directory, 'proxy.yaml'),
      '--route',
      'preview',
      '--dollars',
      '200',
    ],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
  );

  const code = await child.exited;
  const written: unknown = await Bun.file(join(ctx.directory, 'override.json')).json();

  expect(code).toBe(0);

  expect(written).toStrictEqual({
    preview: { start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u), dollars: 200 },
  });
});

test('it exits 1 from the raise command for a config with no override file', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsLines,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 40, month: 600 }',
    ].join('\n'),
  );

  const child = Bun.spawn(
    [
      process.execPath,
      ctx.entry,
      'raise',
      '--config',
      join(ctx.directory, 'proxy.yaml'),
      '--route',
      'preview',
      '--dollars',
      '1',
    ],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
  );

  const code = await child.exited;

  expect(code).toBe(1);
});

test.each(['chatgpt-login', 'chatgpt-logout'])(
  'it exits 1 and names the route when %s targets a route with no login block',
  async (command) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.directory, 'proxy.yaml'),
      [
        'listen: { port: 0 }',
        `store: ${join(ctx.directory, 'counter.json')}`,
        ...ctx.periodsLines,
        'routes:',
        '  preview:',
        `    upstream: ${ctx.model.url}`,
        '    model: model-small',
        '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      ].join('\n'),
    );

    const child = Bun.spawn(
      [
        process.execPath,
        ctx.entry,
        command,
        '--config',
        join(ctx.directory, 'proxy.yaml'),
        '--route',
        'preview',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
    );

    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);

    expect(code).toBe(1);
    expect(output).toContain('the route preview has no login block');
  },
);

test('it removes the login file of a route from the chatgpt-logout command and exits 0', async () => {
  const ctx = await setupTest();

  const loginPath = join(ctx.directory, 'plan-login.json');

  await writeFile(loginPath, '{}');

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(ctx.directory, 'token')} }`,
      'routes:',
      '  codex-plan:',
      '    api: openai-responses',
      `    upstream: ${ctx.model.url}`,
      '    model: model-o',
      '    maxOutputTokens: 1000',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    login:',
      `      file: ${loginPath}`,
      `      routeKeyFile: ${join(ctx.directory, 'plan-key')}`,
    ].join('\n'),
  );

  const child = Bun.spawn(
    [
      process.execPath,
      ctx.entry,
      'chatgpt-logout',
      '--config',
      join(ctx.directory, 'proxy.yaml'),
      '--route',
      'codex-plan',
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
  );

  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(0);
  expect(output).toContain('Removed the login for codex-plan.');

  const isLeft = await Bun.file(loginPath).exists();

  expect(isLeft).toBeFalse();
});
