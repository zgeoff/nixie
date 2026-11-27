import { expect, test } from 'bun:test';
import { pickATCFailure } from './pick-atc-failure';

test.each([
  { code: 'insufficient_scope', status: 'refused', canClear: false, reason: 'insufficient_scope' },
  { code: 'unauthorized', status: 'refused', canClear: false, reason: 'unauthorized' },
  { code: 'protocol_mismatch', status: 'refused', canClear: true, reason: 'protocol_mismatch' },
  { code: 'daemon_unavailable', status: 'refused', canClear: true, reason: 'daemon_unavailable' },
  { code: 'UNAUTHORIZED', status: 'refused', canClear: true, reason: 'bearer_refused' },
  { code: 'FORBIDDEN', status: 'refused', canClear: false, reason: 'forbidden' },
  { code: 'BAD_GATEWAY', status: 'refused', canClear: true, reason: 'gateway_failed' },
])('#pickATCFailure maps the oRPC error $code to $reason', (row) => {
  const error = Object.assign(new Error(row.code), {
    code: row.code,
    defined: row.code === row.code.toLowerCase(),
    status: 500,
  });

  expect(pickATCFailure(error, { procedure: 'session.get', isKeyed: false })).toStrictEqual({
    status: row.status,
    canClear: row.canClear,
    reason: row.reason,
  });
});

test.each([
  { code: 'ECONNREFUSED', reply: { status: 'refused', canClear: true, reason: 'unreachable' } },
  { code: 'ENOTFOUND', reply: { status: 'refused', canClear: true, reason: 'unreachable' } },
  { code: 'ECONNRESET', reply: { status: 'unknown', reason: 'connection_lost' } },
])('#pickATCFailure maps the socket error $code', (row) => {
  const error = Object.assign(new TypeError(row.code), { code: row.code });

  expect(pickATCFailure(error, { procedure: 'session.get', isKeyed: false })).toStrictEqual(
    row.reply,
  );
});

test('#pickATCFailure gives the unknown outcome to a keyed call that a bad gateway answered', () => {
  const error = Object.assign(new Error('BAD_GATEWAY'), {
    code: 'BAD_GATEWAY',
    defined: false,
    status: 502,
  });

  expect(pickATCFailure(error, { procedure: 'session.spawn', isKeyed: true })).toStrictEqual({
    status: 'unknown',
    reason: 'gateway_failed',
  });
});

test('#pickATCFailure gives the unknown outcome to a steer that a proxy answered with an error', () => {
  const error = Object.assign(new Error('INTERNAL_SERVER_ERROR'), {
    code: 'INTERNAL_SERVER_ERROR',
    defined: false,
    status: 500,
  });

  expect(pickATCFailure(error, { procedure: 'session.submit', isKeyed: false })).toStrictEqual({
    status: 'unknown',
    reason: 'gateway_failed',
  });
});
