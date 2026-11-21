import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { APIContext, APITables, SessionScope } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { createSecret } from './create-secret';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';

export interface IssuedCode {
  readonly code: string;
  readonly codeHash: string;
  readonly expiresAt: number;
}

export async function writeEnrolmentCode(
  tx: Transaction<unknown>,
  context: APIContext,
  issuedBy: string | null,
  scope: SessionScope = 'full',
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
      scope,
    })
    .execute();

  return { code, codeHash, expiresAt };
}
