import { expect, test } from 'bun:test';
import { buildCodexFailure } from './build-codex-failure';

test.each([
  { info: { httpConnectionFailed: { httpStatusCode: 401 } }, expected: { reason: 'model_auth' } },
  { info: { httpConnectionFailed: { httpStatusCode: 403 } }, expected: { reason: 'model_auth' } },
  { info: 'unauthorized', expected: { reason: 'model_auth' } },
  {
    info: { responseTooManyFailedAttempts: { httpStatusCode: 429 } },
    expected: { reason: 'model_api', error: 'rate_limit' },
  },
  {
    info: { httpConnectionFailed: { httpStatusCode: 404 } },
    expected: { reason: 'model_api', error: 'model_not_found' },
  },
  {
    info: { responseStreamDisconnected: { httpStatusCode: 502 } },
    expected: { reason: 'model_api', error: 'server_error' },
  },
  {
    info: { httpConnectionFailed: { httpStatusCode: 422 } },
    expected: { reason: 'model_api', error: 'unknown' },
  },
  { info: 'rateLimitExceeded', expected: { reason: 'model_api', error: 'rate_limit' } },
  { info: 'usageLimitExceeded', expected: { reason: 'model_api', error: 'quota' } },
  { info: 'serverOverloaded', expected: { reason: 'model_api', error: 'overloaded' } },
  { info: 'modelNotFound', expected: { reason: 'model_api', error: 'model_not_found' } },
  { info: 'internalServerError', expected: { reason: 'model_api', error: 'server_error' } },
  { info: 'other', expected: { reason: 'model_api', error: 'unknown' } },
  { info: 'contextWindowExceeded', expected: { reason: 'error' } },
  { info: 'sandboxError', expected: { reason: 'error' } },
  { info: null, expected: { reason: 'error' } },
  { info: { activeTurnNotSteerable: { turnKind: 'review' } }, expected: { reason: 'error' } },
])('it builds $expected from the error info $info', (row) => {
  expect(buildCodexFailure({ message: 'It failed.', codexErrorInfo: row.info })).toStrictEqual({
    type: 'failed',
    ...row.expected,
    detail: 'It failed.',
  });
});

test('it adds the additional details to the detail', () => {
  expect(
    buildCodexFailure({ message: 'It failed.', additionalDetails: 'Behind a proxy.' }),
  ).toStrictEqual({ type: 'failed', reason: 'error', detail: 'It failed.: Behind a proxy.' });
});
