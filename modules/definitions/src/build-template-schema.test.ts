import { expect, test } from 'bun:test';
import { buildTemplateSchema } from './build-template-schema';

test('it accepts a template that uses only the known placeholders', () => {
  const result = buildTemplateSchema(['skill', 'agent']).safeParse('{agent} wrote {skill}');

  expect(result.data).toBe('{agent} wrote {skill}');
});

test('it refuses each unknown placeholder, and names it with the known ones', () => {
  const result = buildTemplateSchema(['skill', 'agent']).safeParse('{who} wrote { skill }');

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: [],
      message: 'unknown placeholder {who}; use {skill}, {agent}',
    }),
    expect.objectContaining({
      path: [],
      message: 'unknown placeholder { skill }; use {skill}, {agent}',
    }),
  ]);
});

test('it refuses an empty template', () => {
  const result = buildTemplateSchema(['skill']).safeParse('');

  expect(result.error?.issues).toPartiallyContain({ path: [], code: 'too_small' });
});
