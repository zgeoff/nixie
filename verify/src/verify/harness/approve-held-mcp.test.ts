import { expect, test } from 'bun:test';
import { approveHeldMcp } from './approve-held-mcp';

test.each([
  { label: 'Add the server', change: 'server' },
  { label: 'Allow the tool', change: 'tool' },
] as const)('it asks the server to approve the $change cards of the label $label', async (row) => {
  const asked: unknown[] = [];

  const approved = await approveHeldMcp((operation, args) => {
    asked.push([operation, args]);

    return Promise.resolve(2);
  }, row.label);

  expect([approved, asked]).toStrictEqual([2, [['approveMcp', { change: row.change }]]]);
});

test('it fails when the server approved no card', () => {
  const approval = approveHeldMcp(() => Promise.resolve(0), 'Add the server');

  expect(approval).rejects.toThrow();
});
