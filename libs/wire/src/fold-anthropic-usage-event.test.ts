import { expect, test } from 'bun:test';
import { foldAnthropicUsageEvent } from './fold-anthropic-usage-event';

test("it keeps a call's opening input counts and takes the output count of its last delta", () => {
  const started = foldAnthropicUsageEvent(
    {},
    {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: 12,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 600,
          output_tokens: 1,
        },
      },
    },
  );

  const ended = foldAnthropicUsageEvent(started, {
    type: 'message_delta',
    usage: { output_tokens: 87, input_tokens: null },
  });

  expect(ended).toStrictEqual({
    input_tokens: 12,
    cache_read_input_tokens: 4000,
    cache_creation_input_tokens: 600,
    output_tokens: 87,
  });
});

test('it leaves the reported usage as it is for an event that carries none', () => {
  const reported = { input_tokens: 12, output_tokens: 1 };

  expect(
    foldAnthropicUsageEvent(reported, {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Low tide is at 14:10.' },
    }),
  ).toStrictEqual({ input_tokens: 12, output_tokens: 1 });
});
