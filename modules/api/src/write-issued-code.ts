import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { createSecret } from './create-secret';
import { deriveSecretHash } from './derive-secret-hash';
import { findClientAction } from './find-client-action';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';
import type { APIContext, APITables, Identity } from './types';
import { writeClientAction } from './write-client-action';
import { writeEnrolmentCode } from './write-enrolment-code';

type IssueResult =
  | { readonly status: 'issued'; readonly code: string; readonly expiresAt: number }
  | { readonly status: 'reused' };

// Issues an enrolment code for one more device, a checked action of a signed-in device. nixie keeps
// only the code's hash, so a retry answers with a fresh code that replaces the first, with the same
// lapse time while the first is unused, and never leaves 2 codes working for one action.
export function writeIssuedCode(
  context: APIContext,
  caller: Identity,
  clientActionID: string,
): Promise<IssueResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const earlier = await findClientAction(tx, clientActionID);

    if (earlier !== null && earlier.procedure !== 'sessions.issueCode') {
      return { status: 'reused' };
    }
    const replaced =
      earlier === null
        ? null
        : await updateCodeHash(tx, context, String(earlier.result['codeHash']));
    const issued =
      replaced === null ? await writeEnrolmentCode(tx, context, caller.identityID) : replaced;

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

// swaps an unused, unlapsed code for a fresh one, or null when the first code no longer works
async function updateCodeHash(
  tx: Transaction<unknown>,
  context: APIContext,
  codeHash: string,
): Promise<{ code: string; codeHash: string; expiresAt: number } | null> {
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
