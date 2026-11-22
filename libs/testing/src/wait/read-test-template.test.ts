import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTestTemplate } from './read-test-template';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'test-template-'));

  const name = `orchard-${crypto.randomUUID()}`;
  const templates: string[] = [];

  onTestFinished(async () => {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      ...templates.flatMap((template) => [
        rm(template, { recursive: true, force: true }),
        rm(`${template}.used`, { force: true }),
      ]),
    ]);
  });

  await writeFile(join(directory, 'entry.ts'), 'export const pear = 1;\n');

  const write = mock((building: string) => writeFile(join(building, 'out.js'), 'pear'));

  return {
    write,
    read: async (checkout: string) => {
      const template = await readTestTemplate({
        name,
        checkout,
        root: directory,
        inputs: ['*.ts'],
        write,
      });

      templates.push(template);

      return template;
    },
  };
}

test('it builds a template once for a checkout, and hands the same folder to a later caller', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('/srv/orchard');
  const second = await ctx.read('/srv/orchard');
  const output = await Bun.file(join(first, 'out.js')).text();

  expect(second).toBe(first);
  expect(ctx.write).toHaveBeenCalledOnce();
  expect(output).toBe('pear');
});

test('it builds another template for another checkout of the same files', async () => {
  const ctx = await setupTest();
  const orchard = await ctx.read('/srv/orchard');
  const vineyard = await ctx.read('/srv/vineyard');

  expect(vineyard).not.toBe(orchard);
  expect(ctx.write).toHaveBeenCalledTimes(2);
});
