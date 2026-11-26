import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

test.each([
  { tool: 'drive.search', effects: ['read'], execution: 'direct' },
  { tool: 'drive.read', effects: ['read'], execution: 'direct' },
  { tool: 'drive.create', effects: ['write'], execution: 'queued' },
  { tool: 'drive.change', effects: ['write'], execution: 'queued' },
])('it declares $tool with the effects $effects and runs it $execution', async (row) => {
  const ctx = await startGmailTools();

  const tool = ctx.findAction(row.tool).tool;

  expect([tool.declaration.effects, tool.execution, tool.declaration.destinations]).toStrictEqual([
    row.effects,
    row.execution,
    [],
  ]);
});

test('it needs only the drive.file scope, and checks each write after 5 minutes with a retry', async () => {
  const ctx = await startGmailTools();

  const rows = ctx.driveActions.map((action) => [
    action.tool.name,
    action.scopes,
    action.reconcile.kind === 'check'
      ? [action.reconcile.trustNegativeAfterMs, action.reconcile.onNotFound]
      : null,
  ]);

  expect(rows).toStrictEqual([
    ['drive.search', ['drive.file'], null],
    ['drive.read', ['drive.file'], null],
    ['drive.create', ['drive.file'], [300_000, 'retry']],
    ['drive.change', ['drive.file'], [300_000, 'retry']],
  ]);
});

test('it keeps every file name and the text of a file untrusted', async () => {
  const ctx = await startGmailTools();

  const read = ctx.findAction('drive.read').tool.declaration.results;

  expect([read['name'], read['text']]).toStrictEqual(['untrusted', 'untrusted']);
});

test('it registers every Drive tool, each result field with a source', async () => {
  const ctx = await startGmailTools();

  const registry = buildToolRegistry(ctx.driveActions.map((action) => action.tool));

  expect(registry.toolNames).toHaveLength(4);
});
