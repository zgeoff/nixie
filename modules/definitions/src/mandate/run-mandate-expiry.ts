import { withWriteTransaction } from '@heynixie/log';
import type { RuleContext } from '../runtime/write-runtime-rule';
import { readActiveMandates } from './read-active-mandates';
import { writeMandateEnd } from './write-mandate-end';

// Ends each mandate whose end has passed, then runs one seed. The timer runs it each half minute,
// and the start runs it once, which covers a mandate that ended while the release before ran.
export async function runMandateExpiry(context: RuleContext): Promise<number> {
  const ended = await withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    const active = await readActiveMandates(tx);

    const count = { ended: 0 };

    for (const mandate of active.filter((entry) => entry.expires <= now)) {
      const end = await writeMandateEnd(tx, context, {
        mandateID: mandate.mandateID,
        reason: 'expired',
      });

      count.ended += end.status === 'ended' ? 1 : 0;
    }

    return count.ended;
  });

  if (ended > 0) {
    await context.runInForceSeed();
  }

  return ended;
}
