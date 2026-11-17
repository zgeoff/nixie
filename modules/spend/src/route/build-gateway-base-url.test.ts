import { expect, test } from 'bun:test';
import { buildGatewayBaseURL } from './build-gateway-base-url';

test('it puts the sandbox name and the profile ID after the base URL', () => {
  expect(
    buildGatewayBaseURL('http://10.0.0.2:8789', { sandboxName: 'nixie-abc', profileID: 'opus' }),
  ).toBe('http://10.0.0.2:8789/nixie-abc/opus');
});

test('it drops the slashes that end the base URL', () => {
  expect(
    buildGatewayBaseURL('https://models.example.test/anthropic//', {
      sandboxName: 'nixie-abc',
      profileID: 'opus',
    }),
  ).toBe('https://models.example.test/anthropic/nixie-abc/opus');
});
