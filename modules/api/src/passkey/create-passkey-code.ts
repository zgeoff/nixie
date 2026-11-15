import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { createSecret } from '../enrolment/create-secret';
import { normalizeEnrolmentCode } from '../enrolment/normalize-enrolment-code';
import type { APIContext } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { codeLifetimeMs } from './passkey-state';

// A host command prints a one-time registration code. The API keeps only its hash, in memory, and a
// second code replaces the first.
export async function createPasskeyCode(
  context: APIContext,
): Promise<{ readonly code: string; readonly expiresAt: Date }> {
  const code = createSecret('enrolment-code');
  const issuedAt = context.clock.now();
  const expiresAt = issuedAt + codeLifetimeMs;

  await withWriteTransaction(context.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'passkey_code.issued',
        definitions: context.definitions(),
        payload: { expiresAt },
      },
    ]);
  });

  context.passkeys.code.current = {
    codeHash: deriveSecretHash(normalizeEnrolmentCode(code)),
    issuedAt,
  };

  return { code, expiresAt: new Date(expiresAt) };
}
