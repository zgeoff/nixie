import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunTemplate } from './create-run-template';
import { makeGatedCall } from './make-gated-call';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-template-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'source');
  const parentDir = join(directory, 'templates');

  await mkdir(root);

  return { root, parentDir };
}

test('it builds a template once and hands the same folder to a later caller', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['*.ts'],
    write,
    parentDir: ctx.parentDir,
  };

  const first = await createRunTemplate(options);
  const second = await createRunTemplate(options);
  const output = await Bun.file(join(first, 'out.js')).text();

  expect(second).toBe(first);
  expect(write).toHaveBeenCalledOnce();
  expect(output).toBe('pear');
});

test('it builds once when two callers ask at the same time', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));
  const gated = makeGatedCall(write);

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['*.ts'],
    write: gated.call,
    parentDir: ctx.parentDir,
  };

  const first = createRunTemplate(options);
  const second = createRunTemplate(options);

  await gated.started;

  gated.release();

  const directories = await Promise.all([first, second]);

  expect(directories[1]).toBe(directories[0]);
  expect(write).toHaveBeenCalledOnce();
});

test('it builds a new template when an input file changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['*.ts'],
    write,
    parentDir: ctx.parentDir,
  };

  const first = await createRunTemplate(options);

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 2;\n');

  const second = await createRunTemplate(options);

  expect(second).not.toBe(first);
  expect(write).toHaveBeenCalledTimes(2);
});

test('it removes the older template of the name when it writes a new one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['*.ts'],
    write: (directory: string) => writeFile(join(directory, 'out.js'), 'pear'),
    parentDir: ctx.parentDir,
  };

  await createRunTemplate(options);
  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 2;\n');

  const second = await createRunTemplate(options);
  const entries = await readdir(ctx.parentDir);

  expect(entries).toStrictEqual([second.slice(ctx.parentDir.length + 1)]);
});

test('it never removes a template of another name', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));
  const base = { root: ctx.root, inputs: ['*.ts'], write, parentDir: ctx.parentDir };

  const other = await createRunTemplate({ ...base, name: 'orchard-annex' });

  await createRunTemplate({ ...base, name: 'orchard' });
  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 2;\n');
  await createRunTemplate({ ...base, name: 'orchard' });

  const entries = await readdir(ctx.parentDir);

  expect(entries).toContain(other.slice(ctx.parentDir.length + 1));
});

test('it rejects an input pattern that matches no file, and builds no template', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'seeds'));
  await writeFile(join(ctx.root, 'seeds', 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['{seeds,roots/deep}/**/*.ts'],
    write,
    parentDir: ctx.parentDir,
  };

  expect(createRunTemplate(options)).rejects.toThrowWithMessage(
    Error,
    /the template input \{seeds,roots\/deep\}\/\*\*\/\*\.ts matches no file/u,
  );

  expect(write).not.toHaveBeenCalled();
});

test('it ignores a file under node_modules when it keys the template', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');
  await mkdir(join(ctx.root, 'node_modules'));
  await writeFile(join(ctx.root, 'node_modules', 'dep.ts'), 'export const plum = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['**/*.ts'],
    write,
    parentDir: ctx.parentDir,
  };

  const first = await createRunTemplate(options);

  await writeFile(join(ctx.root, 'node_modules', 'dep.ts'), 'export const plum = 2;\n');

  const second = await createRunTemplate(options);

  expect(second).toBe(first);
});

test('it takes over a lock that a build which died left behind', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((directory: string) => writeFile(join(directory, 'out.js'), 'pear'));

  const options = {
    name: 'orchard',
    root: ctx.root,
    inputs: ['*.ts'],
    write,
    parentDir: ctx.parentDir,
    staleLockMs: 1000,
  };

  const probe = await createRunTemplate({ ...options, write: () => Promise.resolve() });

  await rm(probe, { recursive: true });

  const lock = `${probe}.lock`;

  const past = new Date(Date.now() - 60_000);

  await mkdir(lock);
  await utimes(lock, past, past);

  const directory = await createRunTemplate(options);
  const entries = await readdir(ctx.parentDir);

  expect(directory).toBe(probe);
  expect(write).toHaveBeenCalledOnce();
  expect(entries).toStrictEqual([directory.slice(ctx.parentDir.length + 1)]);
});
