import type { CredentialRecorder, HeldBackend, HeldState } from './types';

export interface RecoveryOptions {
  readonly backend: HeldBackend;
  readonly recorder: CredentialRecorder;
  readonly now: () => number;

  // saves a state and records a change of status
  readonly writeState: (
    credentialID: string,
    previous: HeldState,
    next: HeldState,
  ) => Promise<void>;
}

// A start finds each refresh that wrote `credential.refresh_started` and no result. The provider
// may hold a token nixie never saved, and revoking the spent one may not end it, so the credential
// needs the owner's consent. The refresh is then closed, so the next start finds nothing.
export async function recoverLostRefreshes(options: RecoveryOptions): Promise<void> {
  for (const open of await options.recorder.readOpenRefreshes()) {
    const token = await options.backend.readToken(open.credentialID);

    if (token !== null) {
      await options.writeState(open.credentialID, token.state, {
        ...token.state,
        status: 'needs_consent',
        sinceMs: options.now(),
      });
    }

    await options.recorder.write({
      event: 'refresh_lost',
      credentialID: open.credentialID,
      attemptID: open.attemptID,
    });
  }
}
