import type { ChallengeFor } from './challenge-for';

// The checks that always take a tap, whatever window is open: adding and removing a passkey. Every
// other check lets an open window stand in for the tap. A check kind joins this list here and
// nowhere else.
export const alwaysAskKinds: ReadonlySet<ChallengeFor['kind']> = new Set(['register', 'revoke']);
