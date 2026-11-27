import type { Transaction } from 'kysely';
import type { APIContext, SessionScope } from '../types';

interface EnrolledSession {
  readonly identityID: string;
  readonly name: string;
  readonly scope: SessionScope;
}

interface LabelledSession {
  readonly identityID: string;
  readonly label: string;
}

// What a feature does when a client's session begins, is renamed or ends. Each write hook runs in the
// transaction that changes the session, so the feature's rows never outlive or lag it.
export interface SessionHook {
  // after a session enrols
  readonly onEnrolled?: (
    tx: Transaction<unknown>,
    session: EnrolledSession,
    nowMs: number,
  ) => Promise<void>;

  // after the session's label changes
  readonly onLabelled?: (
    tx: Transaction<unknown>,
    session: LabelledSession,
    nowMs: number,
  ) => Promise<void>;

  // when a revoke or a sign-out ends the session
  readonly onRevoked?: (tx: Transaction<unknown>, identityID: string) => Promise<void>;

  // when a session signs itself out, before its revocation
  readonly onSigningOut?: (context: APIContext, identityID: string) => Promise<void>;
}

let added: readonly SessionHook[] = [];

// The server sets the list at the start of each server, before any part starts. A feature that is
// off adds none.
export const sessionHooks = {
  set: (hooks: readonly SessionHook[]): void => {
    added = hooks;
  },
  list: (): readonly SessionHook[] => added,
};
