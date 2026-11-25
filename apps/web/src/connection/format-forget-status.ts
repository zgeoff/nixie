import { match } from 'ts-pattern';
import type { ConnectionForgetStatus } from '../types';

export interface ForgetLines {
  readonly erasure: string;
  readonly revocation: string;
}

// The erasure and the revocation each get a line, because a forget can finish one and not the other.
export function formatForgetStatus(
  status: Pick<ConnectionForgetStatus, 'erasure' | 'revocation'>,
): ForgetLines {
  return {
    erasure: match(status.erasure)
      .with(
        'done',
        () => 'Erasure: done. The connection’s keys are deleted, so its tokens are unreadable.',
      )
      .with('pending', () => 'Erasure: pending. nixie is still deleting the connection’s keys.')
      .exhaustive(),
    revocation: match(status.revocation)
      .with('confirmed', () => 'Revocation: confirmed. Google ended the grant.')
      .with('pending', () => 'Revocation: pending. nixie has not asked Google yet.')
      .with(
        'refused',
        () =>
          'Revocation: refused. Google would not end the grant, so end it at your Google Account’s third-party access page.',
      )
      .with(
        'unknown',
        () =>
          'Revocation: unknown. nixie could not tell whether Google ended the grant, so check your Google Account’s third-party access page.',
      )
      .with(
        'not_attempted',
        () =>
          'Revocation: not attempted. Another connection reaches the same account, or the token was already gone.',
      )
      .exhaustive(),
  };
}
