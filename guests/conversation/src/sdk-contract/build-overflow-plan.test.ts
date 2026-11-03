import { expect, test } from 'bun:test';
import { buildOverflowPlan } from './build-overflow-plan';

test('it seeds a session with notes, then asks for 4 page reads in the resumed turn', () => {
  const options = { model: 'model-a', env: { HOME: '/home/tide' } };
  const plan = buildOverflowPlan(options, 'tool-calls');

  expect(plan.seedPrompt).toStartWith('Here are harbour notes to keep in mind:\n');
  expect(plan.prompt).toInclude('read pages 1, 2, 3 and 4');
  expect(plan.options).toStrictEqual(options);
});

test('it sends one prompt past the model window with the CLI limit lifted above it', () => {
  const plan = buildOverflowPlan({ model: 'model-a', env: { HOME: '/home/tide' } }, 'model-window');

  expect(plan.seedPrompt).toBeNull();
  expect(plan.prompt.length).toBeGreaterThan(1_050_000);

  expect(plan.options).toStrictEqual({
    model: 'model-a',
    env: { HOME: '/home/tide', CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '10000000' },
  });
});

test('it asks a model that does not exist for a short reply', () => {
  expect(
    buildOverflowPlan({ model: 'model-a', env: { HOME: '/home/tide' } }, 'unknown-model'),
  ).toStrictEqual({
    seedPrompt: null,
    prompt: 'Reply with OK only.',
    options: { model: 'claude-nonesuch-9', env: { HOME: '/home/tide' } },
  });
});

test('it asks for a long story under an output cap of 16 tokens', () => {
  expect(
    buildOverflowPlan({ model: 'model-a', env: { HOME: '/home/tide' } }, 'output-cap'),
  ).toStrictEqual({
    seedPrompt: null,
    prompt: 'Write a 400-word story about a lighthouse.',
    options: { model: 'model-a', env: { HOME: '/home/tide', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16' } },
  });
});
