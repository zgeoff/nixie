import { expect, test } from 'bun:test';
import { foldOpenAIResponseEvent } from './fold-openai-response-event';

test.each(['response.completed', 'response.incomplete', 'response.failed'])(
  'it takes the usage of a %s event in place of the usage reported before it',
  (type) => {
    expect(
      foldOpenAIResponseEvent(
        { input_tokens: 40, input_tokens_details: { cached_tokens: 30 } },
        { type, response: { status: 'completed', usage: { input_tokens: 70, output_tokens: 8 } } },
      ),
    ).toStrictEqual({ input_tokens: 70, output_tokens: 8 });
  },
);

test.each([
  ['a text delta', { type: 'response.output_text.delta', delta: 'Low tide.' }],
  ['a created event with no usage', { type: 'response.created', response: { usage: null } }],
])('it keeps the reported usage for %s', (_case, event) => {
  expect(foldOpenAIResponseEvent({ input_tokens: 70 }, event)).toStrictEqual({
    input_tokens: 70,
  });
});
