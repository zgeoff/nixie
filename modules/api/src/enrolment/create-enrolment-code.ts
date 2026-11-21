import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, SessionScope } from '../types';
import { writeEnrolmentCode } from './write-enrolment-code';

export async function createEnrolmentCode(
  context: APIContext,
  scope: SessionScope = 'full',
): Promise<{ readonly code: string; readonly expiresAt: Date }> {
  const issued = await withWriteTransaction(context.log.writer, (tx) =>
    writeEnrolmentCode(tx, context, null, scope),
  );

  return { code: issued.code, expiresAt: new Date(issued.expiresAt) };
}
