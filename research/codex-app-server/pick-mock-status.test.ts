import { expect, test } from 'bun:test';
import { pickMockStatus } from './pick-mock-status.ts';

test('it answers a model request with 200 when no failure remains', () => {
  expect(pickMockStatus('/backend-api/codex/responses', 0)).toBe(200);
});

test('it answers the workspace list with 200', () => {
  expect(pickMockStatus('/backend-api/wham/accounts/check', 0)).toBe(200);
});

test.each([
  { path: '/backend-api/codex/responses', failures: 1, status: 401 },
  { path: '/backend-api/codex/responses', failures: 2, status: 401 },
  { path: '/oauth/token', failures: 0, status: 401 },
  { path: '/oauth/token/', failures: 0, status: 404 },
  { path: '/backend-api/codex/models', failures: 0, status: 404 },
  { path: '/backend-api/codex/responses/extra', failures: 0, status: 404 },
  { path: '/', failures: 0, status: 404 },
  { path: '', failures: 0, status: 404 },
])('it refuses $path with $status when $failures failures remain', ({ path, failures, status }) => {
  expect(pickMockStatus(path, failures)).toBe(status);
});
