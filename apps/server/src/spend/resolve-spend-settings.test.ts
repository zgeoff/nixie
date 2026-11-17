import { expect, test } from 'bun:test';
import { resolveSpendSettings } from './resolve-spend-settings';

test('it reads the token from the settings entry that the reference names', () => {
  const settings = resolveSpendSettings(
    {
      control: 'http://127.0.0.1:8790',
      token: 'deployment:gateway-control',
      modelURL: 'http://10.0.0.2:8789',
    },
    { 'gateway-control': 'secret-value' },
  );

  expect(settings).toStrictEqual({
    control: 'http://127.0.0.1:8790',
    token: 'secret-value',
    modelURL: 'http://10.0.0.2:8789',
  });
});

test('it gives no settings when the config sets no spendStop', () => {
  expect(resolveSpendSettings(undefined, { 'gateway-control': 'secret-value' })).toBeNull();
});

test('it refuses a token whose settings entry is missing, and names the entry', () => {
  expect(() =>
    resolveSpendSettings(
      {
        control: 'http://127.0.0.1:8790',
        token: 'deployment:gateway-control',
        modelURL: 'http://10.0.0.2:8789',
      },
      {},
    ),
  ).toThrow(
    'spendStop.token is deployment:gateway-control, and the secrets file has no settings entry gateway-control',
  );
});
