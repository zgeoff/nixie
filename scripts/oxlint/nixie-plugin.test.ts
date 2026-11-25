import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-oxlint-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await writeFile(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      jsPlugins: [join(import.meta.dir, 'nixie-plugin.js')],
      rules: { 'nixie/no-credential-group-reads': 'error' },
    }),
  );

  const lint = async (source: string): Promise<readonly string[]> => {
    await writeFile(join(directory, 'sample.ts'), source);

    const process = Bun.spawn(
      [
        join(import.meta.dir, '../../node_modules/.bin/oxlint'),
        '-c',
        '.oxlintrc.json',
        '--format',
        'json',
        'sample.ts',
      ],
      { cwd: directory, stdout: 'pipe', stderr: 'pipe' },
    );

    const output = await new Response(process.stdout).text();

    return [...output.matchAll(/"code":\s*"(?<code>nixie\([^"]+\))"/gu)].map(
      (found) => found.groups?.['code'] ?? '',
    );
  };

  return { lint };
}

test.each([
  ['member access', 'const a = secrets.model_credentials;'],
  ['a string index', "const a = secrets['connector_credentials'];"],
  ['destructuring', 'const { model_credentials } = secrets;'],
  ['the settings group of a secrets object', 'const a = secrets.settings;'],
  ['destructuring the settings group of a secrets object', 'const { settings } = secrets;'],
  [
    'destructuring the settings group of a secrets member',
    'const { settings: owner } = options.secrets;',
  ],
  ['a group of a secrets file in a pattern with other keys', 'const { a, model_credentials } = x;'],
  ['the settings group through an alias', 'const copy = secrets;\nconst a = copy.settings;'],
  [
    'the settings group through an alias of a member',
    'const copy = options.secretsFile;\nconst a = copy.settings;',
  ],
  [
    'the settings group through a reassigned alias',
    'let copy;\ncopy = secrets;\nconst a = copy.settings;',
  ],
  [
    'the settings group through a destructured alias of an alias',
    'const copy = secrets;\nconst { settings } = copy;',
  ],
  [
    'the settings group through a destructuring assignment',
    'let settings;\n({ settings } = secrets);',
  ],
  [
    'the settings group through an alias that destructuring options.secrets made',
    'const { secrets: held } = options;\nconst a = held.settings;',
  ],
  [
    'the settings group through an alias made by an assignment pattern with a default',
    'const { secretsFile: held = other } = options;\nconst a = held.settings;',
  ],
  [
    'the settings group through an alias made by a nested pattern',
    'const { deps: { secrets: held } } = options;\nconst a = held.settings;',
  ],
  ['the settings group through a type assertion', 'const a = (secrets as Loaded).settings;'],
  ['the settings group through an optional chain', 'const a = secrets?.settings;'],
])('it refuses a read of a secrets group by %s', async (_label, source) => {
  const ctx = await setupTest();
  const codes = await ctx.lint(source);

  expect(codes).toStrictEqual(['nixie(no-credential-group-reads)']);
});

test.each([
  ['an object literal key', "const a = { model_credentials: { anthropic: 'x' } };"],
  ['the settings member of another object', 'const a = form.settings;'],
  ['destructuring settings from another object', 'const { settings } = form;'],
  [
    'the settings member of an alias of another object',
    'const copy = form;\nconst a = copy.settings;',
  ],
  [
    'an alias that destructuring another object made',
    'const { form: held } = options;\nconst a = held.settings;',
  ],
  ['a string that names a group', "const a = 'model_credentials';"],
])('it allows %s', async (_label, source) => {
  const ctx = await setupTest();
  const codes = await ctx.lint(source);

  expect(codes).toStrictEqual([]);
});
