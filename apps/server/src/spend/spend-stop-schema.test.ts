import { expect, test } from 'bun:test';
import { spendStopSchema } from './spend-stop-schema';

test('it accepts a control URL, a token reference and a model URL', () => {
  const result = spendStopSchema.safeParse({
    control: 'http://127.0.0.1:8790',
    token: 'deployment:gateway-control',
    modelURL: 'http://10.0.0.2:8789',
  });

  expect(result.success).toBe(true);
});

test('it refuses a token that is not a reference into the secrets file', () => {
  const result = spendStopSchema.safeParse({
    control: 'http://127.0.0.1:8790',
    token: 'plain-value',
    modelURL: 'http://10.0.0.2:8789',
  });

  expect(result.success).toBe(false);
});

test('it refuses a control address that is not a URL', () => {
  const result = spendStopSchema.safeParse({
    control: 'localhost',
    token: 'deployment:gateway-control',
    modelURL: 'http://10.0.0.2:8789',
  });

  expect(result.success).toBe(false);
});

test('it refuses a spendStop with no model URL', () => {
  const result = spendStopSchema.safeParse({
    control: 'http://127.0.0.1:8790',
    token: 'deployment:gateway-control',
  });

  expect(result.success).toBe(false);
});
