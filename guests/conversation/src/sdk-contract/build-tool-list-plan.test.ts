import { expect, test } from 'bun:test';
import { buildToolListPlan } from './build-tool-list-plan';

test('it resumes a session with the options it was given', () => {
  const options = {
    model: 'model-a',
    systemPrompt: { type: 'custom' as const, prompt: 'Be brief.', snapshot: false },
  };

  expect(buildToolListPlan(options, 'resumed-session')).toStrictEqual({ kind: 'resumed', options });
});

test('it resumes a session with a plain system prompt, which the CLI snapshots', () => {
  const options = {
    model: 'model-a',
    systemPrompt: { type: 'custom' as const, prompt: 'Be brief.', snapshot: false },
  };

  expect(buildToolListPlan(options, 'resumed-snapshot')).toStrictEqual({
    kind: 'resumed',
    options: {
      model: 'model-a',
      systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    },
  });
});

test.each([
  ['mid-turn-silent', false],
  ['mid-turn-notice', true],
] as const)(
  'it changes the tool mid-turn for %s, with a notice sent: %p',
  (scenario, isNoticeSent) => {
    const options = { model: 'model-a' };

    expect(buildToolListPlan(options, scenario)).toStrictEqual({
      kind: 'mid-turn',
      options,
      isNoticeSent,
    });
  },
);
