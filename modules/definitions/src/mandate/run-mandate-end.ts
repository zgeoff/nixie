import { withWriteTransaction } from '@heynixie/log';
import type { RuleContext } from '../runtime/write-runtime-rule';
import { writeMandateEnd } from './write-mandate-end';

// End now, for a caller that holds no transaction of its own.
export async function runMandateEnd(
  context: RuleContext,
  mandateID: string,
): Promise<'ended' | 'not_active'> {
  const end = await withWriteTransaction(context.log.writer, (tx) =>
    writeMandateEnd(tx, context, { mandateID, reason: 'ended' }),
  );

  if (end.status === 'ended') {
    await context.runInForceSeed();
  }

  return end.status;
}
