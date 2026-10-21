import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { createSecret } from './create-secret';
import { deriveSecretHash } from './derive-secret-hash';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';
import type { APIContext, APITables } from './types';

export interface IssuedCode {
  readonly code: string;
  readonly codeHash: string;
  readonly expiresAt: number;
}

export async function writeEnrolmentCode(
  tx: Transaction<unknown>,
  context: APIContext,
  issuedBy: string | null,
): Promise<IssuedCode> {
  const code = createSecret('enrolment-code');
  const codeHash = deriveSecretHash(normalizeEnrolmentCode(code));
  const now = context.clock.now();
  const expiresAt = now + context.settings.enrolmentCodeLifetimeMs;

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'enrolment_code.issued',
      definitions: context.definitions(),
      payload: { issuedBy, expiresAt },
    },
  ]);

  await tx
    .$extendTables<APITables>()
    .insertInto('enrolment_codes')
    .values({
      code_hash: codeHash,
      issued_at: now,
      expires_at: expiresAt,
      issued_by: issuedBy,
      used_at: null,
      identity_id: null,
    })
    .execute();

  return { code, codeHash, expiresAt };
}
