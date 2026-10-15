import { expect, onTestFinished, test } from 'bun:test';
import { sandboxConfigSchema } from './sandbox-config-schema';

test('it reads the imp adapter when the section sets none', () => {
  const result = sandboxConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({ adapter: 'imp' });
});

test('it reads the test adapter in a test build', () => {
  const result = sandboxConfigSchema.safeParse({ adapter: 'test' });

  expect(result.data).toStrictEqual({ adapter: 'test' });
});

test('it refuses the test adapter in a release build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const result = sandboxConfigSchema.safeParse({ adapter: 'test' });

  expect(result.error?.issues).toPartiallyContain({ path: ['adapter'] });
});

test('it reads the imp adapter in a release build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const result = sandboxConfigSchema.safeParse({ adapter: 'imp' });

  expect(result.data).toStrictEqual({ adapter: 'imp' });
});

test('it refuses an adapter it does not know', () => {
  const result = sandboxConfigSchema.safeParse({ adapter: 'docker' });

  expect(result.error?.issues).toPartiallyContain({ path: ['adapter'] });
});

test('it refuses a key the section does not have', () => {
  const result = sandboxConfigSchema.safeParse({ adapter: 'imp', image: 'nixie' });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
