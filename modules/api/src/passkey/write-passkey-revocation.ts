import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, APITables, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import type { Assertion } from './challenge-for';
import type { PasskeyVerdict } from './create-passkey-check';
import { createPasskeyCheck } from './create-passkey-check';
import { updatePasskeyRevoked } from './update-passkey-revoked';

interface RevocationRequest {
  readonly clientActionID: string;
  readonly passkeyID: string;
  readonly assertion: Assertion;
}

export type PasskeyRevocationResult =
  | { readonly status: 'revoked'; readonly revokedAt: number }
  | { readonly status: 'failed'; readonly verdict: Extract<PasskeyVerdict, { error: string }> }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const procedure = 'passkeys.revoke';

// A client revoke takes an assertion on a revoke challenge from any live passkey, the one being
// revoked included. A failed check stores nothing, so a retry with a fresh assertion runs again.
export function writePasskeyRevocation(
  context: APIContext,
  caller: Identity,
  request: RevocationRequest,
): Promise<PasskeyRevocationResult> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<PasskeyRevocationResult> => {
    if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
      return { status: 'unauthorized' };
    }

    const inputHash = buildInputHash({ passkeyID: request.passkeyID });

    const earlier = await readClientAction(tx, request.clientActionID);

    if (earlier !== null) {
      return earlier.procedure === procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash
        ? { status: 'revoked', revokedAt: Number(earlier.result['revokedAt']) }
        : { status: 'reused' };
    }

    const target = await tx
      .$extendTables<APITables>()
      .selectFrom('passkeys')
      .select('revoked_at')
      .where('passkey_id', '=', request.passkeyID)
      .executeTakeFirst();

    if (target === undefined) {
      return { status: 'not_found' };
    }

    const verdict = await createPasskeyCheck(context).verify(
      tx,
      caller,
      { kind: 'revoke', passkeyID: request.passkeyID },
      request.assertion,
    );

    if ('error' in verdict) {
      return { status: 'failed', verdict };
    }

    const revokedAt = await updatePasskeyRevoked(tx, context, {
      passkeyID: request.passkeyID,
      revokedBy: caller.identityID,
    });

    await writeClientAction(tx, {
      clientActionID: request.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { revokedAt },
      recordedAt: context.clock.now(),
    });

    return { status: 'revoked', revokedAt };
  });
}
