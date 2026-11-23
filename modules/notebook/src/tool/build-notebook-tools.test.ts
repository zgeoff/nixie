import { expect, test } from 'bun:test';
import { startTestNotebook } from '../test-utils';
import { buildNotebookTools } from './build-notebook-tools';
import { notebookToolNames } from './notebook-tool-names';

test('it builds the 10 tools under their names', async () => {
  const ctx = await startTestNotebook();

  const tools = buildNotebookTools(() => ctx.notebook);

  expect(tools.map((tool) => tool.name)).toStrictEqual([...notebookToolNames]);
});

test.each([
  'notebook.write',
  'notebook.edit',
  'notebook.link',
  'notebook.unlink',
  'notebook.forget',
])('it declares the note effect and a direct run for %s', async (name) => {
  const ctx = await startTestNotebook();

  const tool = buildNotebookTools(() => ctx.notebook).find((entry) => entry.name === name);

  expect([tool?.declaration.effects, tool?.execution]).toStrictEqual([['note'], 'direct']);
});

test.each([
  'notebook.read',
  'notebook.history',
  'notebook.find',
  'notebook.check',
  'notebook.walk',
])('it declares the read effect and a direct run for %s', async (name) => {
  const ctx = await startTestNotebook();

  const tool = buildNotebookTools(() => ctx.notebook).find((entry) => entry.name === name);

  expect([tool?.declaration.effects, tool?.execution]).toStrictEqual([['read'], 'direct']);
});

test.each([
  ['notebook.read', 'body', 'untrusted'],
  ['notebook.read', 'title', 'untrusted'],
  ['notebook.read', 'links', 'untrusted'],
  ['notebook.read', 'version', 'owner_data'],
  ['notebook.find', 'notes', 'untrusted'],
  ['notebook.find', 'isMeaningPartial', 'owner_data'],
  ['notebook.walk', 'nodes', 'untrusted'],
  ['notebook.walk', 'gone', 'owner_data'],
  ['notebook.write', 'note', 'owner_data'],
  ['notebook.edit', 'version', 'owner_data'],
] as const)('it marks the %s result field %s as %s', async (name, field, mark) => {
  const ctx = await startTestNotebook();

  const tool = buildNotebookTools(() => ctx.notebook).find((entry) => entry.name === name);

  expect(tool?.declaration.results[field]).toBe(mark);
});

test('it tells the assistant that a note named only in another note counts as an orphan', async () => {
  const ctx = await startTestNotebook();

  const check = buildNotebookTools(() => ctx.notebook).find(
    (entry) => entry.name === 'notebook.check',
  );

  expect(check?.description).toMatch(/orphan/iu);
});
