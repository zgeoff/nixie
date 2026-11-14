import { expect, test } from 'bun:test';
import { resolveSandboxSettings } from './resolve-sandbox-settings';

test("it resolves the imp adapter with impd's section and token", () => {
  const settings = resolveSandboxSettings(
    {
      sandbox: { adapter: 'imp' },
      imp: { url: 'http://127.0.0.1:7070', publicEgress: null },
    },
    'impd-token',
  );

  expect(settings).toStrictEqual({
    adapter: 'imp',
    imp: { url: 'http://127.0.0.1:7070', publicEgress: null, token: 'impd-token' },
  });
});

test('it resolves the test sandbox with no imp section and no impd token', () => {
  const settings = resolveSandboxSettings({ sandbox: { adapter: 'test' } }, null);

  expect(settings).toStrictEqual({ adapter: 'test' });
});

test('it refuses the imp adapter when the secrets file holds no impd token', () => {
  expect(() =>
    resolveSandboxSettings(
      {
        sandbox: { adapter: 'imp' },
        imp: { url: 'http://127.0.0.1:7070', publicEgress: null },
      },
      null,
    ),
  ).toThrowWithMessage(Error, /holds no impd_token/u);
});
