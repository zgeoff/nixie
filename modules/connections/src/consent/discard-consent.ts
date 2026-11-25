import { writeRecords } from '@heynixie/log';
import { consentDiscardedCodec } from '../record/consent-discarded-codec';
import { readRevocationOutcomes } from '../revocation/read-revocation-outcomes';
import { writeRevocationRecorded } from '../revocation/write-revocation-recorded';
import type { ServiceContext } from '../service-context';
import { removeConsentRequest } from './claim-consent';

export interface DiscardedConsent {
  readonly consentID: string;

  // the consent's own credential, whose token nixie keeps no copy of
  readonly credentialID: string;
  readonly reason:
    | 'account_mismatch'
    | 'connection_forgotten'
    | 'forget_in_progress'
    | 'no_account';

  // false when a live connection reaches the account, so Google's revocation would end its grant too
  readonly isRevoked: boolean;
}

// Keeps no token from a consent that finished. The credential's token goes through the forget
// runner, which makes the one revocation attempt and deletes its keys; a consent whose account a
// live connection reaches records `not_attempted` first, so the runner sends none.
export async function discardConsent(
  context: ServiceContext,
  discarded: DiscardedConsent,
): Promise<void> {
  await removeConsentRequest(context, discarded.consentID);

  if (!discarded.isRevoked) {
    await writeRevocationRecorded(context, discarded.credentialID, {
      outcome: 'not_attempted',
      status: null,
      providerError: null,
    });
  }

  const begun = await context.forget.begin({ connection: discarded.credentialID }, { by: 'user' });

  if (begun.status === 'begun') {
    await context.forget.finish(discarded.credentialID).catch(() => null);
  }

  const outcomes = await readRevocationOutcomes(context.log);

  if (discarded.reason === 'no_account') {
    return;
  }

  await writeRecords(context.log, [
    {
      kind: consentDiscardedCodec.kind,
      definitions: context.definitions(),
      payload: consentDiscardedCodec.encode({
        reason: discarded.reason,
        revocation: outcomes.get(discarded.credentialID) ?? 'unknown',
      }),
    },
  ]);
}
