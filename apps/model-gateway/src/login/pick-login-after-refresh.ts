import type { LoginFile } from './login-file-schema';
import type { RefreshAnswer } from './parse-refresh-answer';

// the failures in a row after which a login shows as failing
const failuresBeforeFailing = 3;

export interface LoginAfterRefresh {
  // null when the answer changes nothing in the file
  readonly login: LoginFile | null;

  // the refreshes in a row that got a service error or no answer
  readonly failures: number;
}

export function pickLoginAfterRefresh(
  held: LoginFile,
  answer: RefreshAnswer,
  failures: number,
  nowIso: string,
): LoginAfterRefresh {
  if (answer.kind === 'token') {
    return {
      failures: 0,
      login: {
        ...held,
        refreshToken: answer.refreshToken ?? held.refreshToken,
        status: 'active',
        reason: null,
        statusSince: held.status === 'active' ? held.statusSince : nowIso,
        lastRefreshAt: nowIso,
      },
    };
  }

  if (answer.kind === 'refused') {
    return {
      failures: 0,
      login:
        held.status === 'needs_login'
          ? null
          : { ...held, status: 'needs_login', reason: 'refused', statusSince: nowIso },
    };
  }

  const reason = answer.kind === 'no_answer' ? 'no_answer' : 'service_error';
  const total = failures + 1;

  if (total < failuresBeforeFailing || (held.status === 'failing' && held.reason === reason)) {
    return { failures: total, login: null };
  }

  return {
    failures: total,
    login: {
      ...held,
      status: 'failing',
      reason,
      statusSince: held.status === 'failing' ? held.statusSince : nowIso,
    },
  };
}
