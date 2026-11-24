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

    const report: { diagnostics: { code: string; message: string }[] } = JSON.parse(output);

    return report.diagnostics
      .map((diagnostic) => diagnostic.code)
      .filter((code) => code.startsWith('nixie('));
  };

  return { lint };
}

test.each([
  ['member access', 'const a = secrets.model_credentials;'],
  ['a string index', "const a = secrets['connector_credentials'];"],
  ['destructuring', 'const { model_credentials } = secrets;'],
  ['the settings group of a secrets object', 'const a = secrets.settings;'],
])('it refuses a read of a secrets group by %s', async (_label, source) => {
  const ctx = await setupTest();
  const codes = await ctx.lint(source);

  expect(codes).toStrictEqual(['nixie(no-credential-group-reads)']);
});

test.each([
  ['an object literal key', "const a = { model_credentials: { anthropic: 'x' } };"],
  ['the settings member of another object', 'const a = form.settings;'],
  ['a string that names a group', "const a = 'model_credentials';"],
])('it allows %s', async (_label, source) => {
  const ctx = await setupTest();
  const codes = await ctx.lint(source);

  expect(codes).toStrictEqual([]);
});
