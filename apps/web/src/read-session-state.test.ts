import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { readSessionState } from './read-session-state';

test('it reads a session as live when the first read succeeds', async () => {
  const state = await readSessionState(() => Promise.resolve({ items: [] }));

  expect(state).toBe('live');
});

// bun test resolves the isomorphic server check to the server, as the Start server render does.
test('it leaves a session the API refuses during the server render unchecked', async () => {
  const state = await readSessionState(() => Promise.reject(new ORPCError('UNAUTHORIZED')));

  expect(state).toBe('unchecked');
});

test('it throws any other failure of the first read', () => {
  const read = readSessionState(() => Promise.reject(new ORPCError('INTERNAL_SERVER_ERROR')));

  expect(read).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});
