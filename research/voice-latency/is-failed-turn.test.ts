import { expect, test } from 'bun:test';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { buildResultFields } from './build-result-fields.ts';
import { isFailedTurn } from './is-failed-turn.ts';

// The shape the SDK gives when the model request fails: the subtype says success, `is_error` is
// set, and `result` holds the error text.
const apiErrorResult = {
  duration_api_ms: 0,
  duration_ms: 412,
  is_error: true,
  num_turns: 1,
  result: 'API Error: 529 the service is overloaded',
  session_id: 'b9a4c3d2-5e6f-4a1b-8c7d-0e9f8a7b6c5d',
  stop_reason: null,
  subtype: 'success',
  total_cost_usd: 0,
  type: 'result',
  uuid: '4f3e2d1c-0b9a-4876-9543-21fedcba9876',
} as unknown as SDKResultMessage;

test('it counts a success result that carries an API error as a failed turn', () => {
  expect(isFailedTurn({ kind: 'turn', ...buildResultFields(apiErrorResult) })).toBe(true);
});

test('it keeps the API error flag beside the subtype', () => {
  expect(buildResultFields(apiErrorResult)).toStrictEqual({
    isError: true,
    subtype: 'success',
    ttftStreamMs: undefined,
  });
});

test('it counts a success result without an error as a whole turn', () => {
  expect(isFailedTurn({ isError: false, kind: 'turn', subtype: 'success' })).toBe(false);
});

test('it counts an error subtype as a failed turn', () => {
  expect(isFailedTurn({ isError: true, kind: 'turn', subtype: 'error_during_execution' })).toBe(true);
});
