// A connection another consent could match: the account `sub` it reaches and whether its Forget has
// begun.
export interface KnownAccount {
  readonly connectionID: string;
  readonly subject: string;
  readonly binding: 'enabled' | 'removing';
}

export interface ConsentFacts {
  // the connection the consent renews, or null for a consent that names none
  readonly again: string | null;

  // the `sub` of the ID token that the consent returned
  readonly subject: string;
  readonly known: readonly KnownAccount[];
}

// `new` keeps the consent's token as a new connection.
export type ConsentOutcome =
  | { readonly kind: 'new' }

  // replaces the token of the live connection that reaches the same account
  | { readonly kind: 'renew'; readonly connectionID: string }

  // waits for the Forget of the connection that reaches the same account, then decides again
  | { readonly kind: 'wait'; readonly connectionID: string }

  // keeps no token; `isRevoked` says whether the one revocation attempt may go to Google
  | {
      readonly kind: 'discard';
      readonly reason: 'account_mismatch' | 'connection_forgotten';
      readonly isRevoked: boolean;
    };

// Decides what a finished consent does, from the connections that exist. Google's revocation ends
// the whole grant of an account, so a consent whose account a live connection reaches never revokes.
export function pickConsentOutcome(facts: ConsentFacts): ConsentOutcome {
  const sameAccount = facts.known.filter((account) => account.subject === facts.subject);
  const live = sameAccount.find((account) => account.binding === 'enabled');

  if (facts.again !== null) {
    const target = facts.known.find((account) => account.connectionID === facts.again);

    if (target?.binding !== 'enabled') {
      return { kind: 'discard', reason: 'connection_forgotten', isRevoked: live === undefined };
    }

    if (target.subject !== facts.subject) {
      return { kind: 'discard', reason: 'account_mismatch', isRevoked: live === undefined };
    }

    return { kind: 'renew', connectionID: target.connectionID };
  }

  if (live !== undefined) {
    return { kind: 'renew', connectionID: live.connectionID };
  }

  const removing = sameAccount.find((account) => account.binding === 'removing');

  return removing === undefined
    ? { kind: 'new' }
    : { kind: 'wait', connectionID: removing.connectionID };
}
