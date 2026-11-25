import { expect, test } from 'bun:test';
import { pickATCReply } from './pick-atc-reply';

test.each([
  {
    code: 'outcome_unknown',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'unknown',
    canClear: null,
  },
  {
    code: 'daemon_unavailable',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'unknown',
    canClear: null,
  },
  {
    code: 'no_such_session',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'unknown',
    canClear: null,
  },
  {
    code: 'daemon_unavailable',
    tool: 'atc_session_stop',
    isKeyed: false,
    status: 'refused',
    canClear: true,
  },
  {
    code: 'target_unavailable',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'refused',
    canClear: true,
  },
  {
    code: 'host_unavailable',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'refused',
    canClear: true,
  },
  { code: 'timeout', tool: 'atc_session_get', isKeyed: false, status: 'refused', canClear: true },
  {
    code: 'too_slow',
    tool: 'atc_terminal_type',
    isKeyed: false,
    status: 'refused',
    canClear: true,
  },
  {
    code: 'permission_pending',
    tool: 'atc_terminal_type',
    isKeyed: false,
    status: 'refused',
    canClear: true,
  },
  {
    code: 'host_leased',
    tool: 'atc_session_stop',
    isKeyed: false,
    status: 'refused',
    canClear: true,
  },
  {
    code: 'host_leased',
    tool: 'atc_session_get',
    isKeyed: false,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'idempotency_conflict',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'bad_args',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'target_forbidden',
    tool: 'atc_session_spawn',
    isKeyed: true,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'session_dead',
    tool: 'atc_terminal_type',
    isKeyed: false,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'unsupported',
    tool: 'atc_transcript_read',
    isKeyed: false,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'no_such_session',
    tool: 'atc_session_get',
    isKeyed: false,
    status: 'refused',
    canClear: false,
  },
  {
    code: 'something_new',
    tool: 'atc_session_get',
    isKeyed: false,
    status: 'refused',
    canClear: false,
  },
])('it maps $code on $tool, keyed $isKeyed, to $status', (row) => {
  const reply = pickATCReply({ code: row.code, tool: row.tool, isKeyed: row.isKeyed });

  expect({
    status: reply.status,
    canClear: reply.status === 'refused' ? reply.canClear : null,
    reason: reply.reason,
  }).toStrictEqual({ status: row.status, canClear: row.canClear, reason: row.code });
});
