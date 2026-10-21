import { withWriteTransaction } from '@heynixie/log';
import type { APIContext } from './types';
import { writeEnrolmentCode } from './write-enrolment-code';

export async function createEnrolmentCode(
  context: APIContext,
): Promise<{ readonly code: string; readonly expiresAt: Date }> {
  const issued = await withWriteTransaction(context.log.writer, (tx) =>
    writeEnrolmentCode(tx, context, null),
  );

  return { code: issued.code, expiresAt: new Date(issued.expiresAt) };
}
