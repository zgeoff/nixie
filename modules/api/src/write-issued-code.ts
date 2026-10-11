import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { createSecret } from './create-secret';
import { deriveSecretHash } from './derive-secret-hash';
import type { ClientAction } from './find-client-action';
import { findClientAction } from './find-client-action';
import { isLiveIdentity } from './is-live-identity';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';
import type { APIContext, APITables, Identity } from './types';
import { writeClientAction } from './write-client-action';
import type { IssuedCode } from './write-enrolment-code';
import { writeEnrolmentCode } from './write-enrolment-code';

type IssueResult =
  | { readonly status: 'issued'; readonly code: string; readonly expiresAt: number }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Issues an enrolment code for one more device. nixie keeps only the code's hash, so the caller's
// retry answers with a fresh code that replaces the first, with the same lapse time. Once the first
// code is used or lapsed the action is over, and a retry is refused as reused.
export function writeIssuedCode(
  context: APIContext,
  caller: Identity,
  clientActionID: string,
): Promise<IssueResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const live = await isLiveIdentity(tx, context, caller.identityID);

    if (!live) {
      return { status: 'unauthorized' };
    }
    const earlier = await findClientAction(tx, clientActionID);
    const issued =
      earlier === null
        ? await writeEnrolmentCode(tx, context, caller.identityID)
        : await updateRetriedCode(tx, context, { caller, earlier });

    if (issued === null) {
      return { status: 'reused' };
    }

    await writeClientAction(tx, {
      clientActionID,
      procedure: 'sessions.issueCode',
      identityID: caller.identityID,
      inputHash: null,
      result: { codeHash: issued.codeHash },
      recordedAt: context.clock.now(),
    });
    return { status: 'issued', code: issued.code, expiresAt: issued.expiresAt };
  });
}

interface CodeRetry {
  readonly caller: Identity;
  readonly earlier: ClientAction;
}

// swaps the caller's unused, unlapsed code for a fresh one, or null when the ID belongs to another
// action or caller, or its code no longer works
async function updateRetriedCode(
  tx: Transaction<unknown>,
  context: APIContext,
  retry: CodeRetry,
): Promise<IssuedCode | null> {
  if (
    retry.earlier.procedure !== 'sessions.issueCode' ||
    retry.earlier.identityID !== retry.caller.identityID
  ) {
    return null;
  }
  const codeHash = String(retry.earlier.result['codeHash']);
  const code = createSecret('enrolment-code');
  const freshHash = deriveSecretHash(normalizeEnrolmentCode(code));
  const updated = await tx
    .$extendTables<APITables>()
    .updateTable('enrolment_codes')
    .set({ code_hash: freshHash })
    .where('code_hash', '=', codeHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', context.clock.now())
    .returning('expires_at')
    .executeTakeFirst();

  return updated === undefined
    ? null
    : { code, codeHash: freshHash, expiresAt: updated.expires_at };
}
