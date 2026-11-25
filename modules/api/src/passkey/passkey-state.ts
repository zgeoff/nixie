import type { ChallengeFor } from './challenge-for';

export const challengeLifetimeMs = 5 * 60 * 1000;
export const codeLifetimeMs = 15 * 60 * 1000;
export const maxLivePasskeys = 10;

export interface PendingChallenge {
  readonly identityID: string;
  readonly binding: ChallengeFor;
  readonly issuedAt: number;
}

interface PendingRegistration {
  readonly challenge: string;
  readonly origin: string;
  readonly rpID: string;
  readonly userHandle: Uint8Array<ArrayBuffer>;

  // 'code', or the ID of the passkey whose assertion allowed the options
  readonly authorizedBy: string;
  readonly issuedAt: number;
}

interface PendingCode {
  readonly codeHash: string;
  readonly issuedAt: number;
}

// What the API keeps in memory for the passkey checks. Each entry lasts minutes, and a restart
// costs one more tap or one more code.
export interface PasskeyState {
  // keyed by the challenge value
  readonly challenges: Map<string, PendingChallenge>;

  // keyed by the identity ID of the session that asked
  readonly registrations: Map<string, PendingRegistration>;

  // when the window that a session's last tap opened closes, keyed by the session's identity ID
  readonly windows: Map<string, number>;
  readonly code: { current: PendingCode | null };

  // the one user handle every passkey shares, fixed when the first options are issued
  readonly userHandle: { current: Uint8Array<ArrayBuffer> | null };
}

export function createPasskeyState(): PasskeyState {
  return {
    challenges: new Map(),
    registrations: new Map(),
    windows: new Map(),
    code: { current: null },
    userHandle: { current: null },
  };
}
