import { expect, test } from 'bun:test';
import { codeConfigSchema } from './code-config-schema';

test('it accepts an empty section', () => {
  expect(codeConfigSchema.parse({})).toStrictEqual({});
});

test('it rejects a field, because the section takes none', () => {
  expect(codeConfigSchema.safeParse({ limit: 1 }).success).toBeFalse();
});
