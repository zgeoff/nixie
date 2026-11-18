import { expect, test } from 'bun:test';
import { buildMockCodexProfile } from './build-mock-codex-profile';

test('it builds a default codex profile', () => {
  expect(buildMockCodexProfile()).toStrictEqual({
    id: expect.toBeString(),
    harness: 'codex',
    baseURL: expect.toStartWith('https://'),
    credential: expect.toStartWith('deployment:'),
    model: expect.toBeString(),
    effort: 'medium',
    prices: null,
    chatgptLogin: false,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockCodexProfile({ id: 'worker', effort: 'high' })).toStrictEqual({
    id: 'worker',
    harness: 'codex',
    baseURL: expect.toStartWith('https://'),
    credential: expect.toStartWith('deployment:'),
    model: expect.toBeString(),
    effort: 'high',
    prices: null,
    chatgptLogin: false,
  });
});
