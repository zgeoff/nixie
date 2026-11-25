import { expect, test } from 'bun:test';
import { readDeclaredRecordKinds } from './read-declared-record-kinds';

test('it reads the kinds that a module and the server declare', async () => {
  const kinds = await readDeclaredRecordKinds();

  expect(kinds).toIncludeAllMembers(['task.created', 'memory.proposed', 'server.started']);
});

test('it leaves out a kind that only a test declares', async () => {
  const kinds = await readDeclaredRecordKinds();

  expect(kinds).not.toContain('note_written');
});
