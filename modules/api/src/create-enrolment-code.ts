import { withWriteTransaction } from '@heynixie/log';
import type { APIContext } from './types';
import { writeEnrolmentCode } from './write-enrolment-code';

// Issues an enrolment code on the host, for the host command that signs in a device when no
// signed-in client can issue one. The code works once and lapses unused after 15 min by default.
export async function createEnrolmentCode(
  context: APIContext,
): Promise<{ readonly code: string; readonly expiresAt: Date }> {
  const issued = await withWriteTransaction(context.log.writer, (tx) =>
    writeEnrolmentCode(tx, context, null),
  );

  return { code: issued.code, expiresAt: new Date(issued.expiresAt) };
}
