import { withWriteTransaction } from '@heynixie/log';
import type { SetWakeRule, WakeRuleInput } from '@heynixie/triggers';
import { setWakeRuleInTransaction } from '@heynixie/triggers';
import type { GmailDeps } from './types';

export interface GmailWakeRuleRequest extends Omit<WakeRuleInput, 'mailbox'> {
  readonly connectionID: string;
}

// Writes a wake rule of a Gmail connection. The write transaction checks that the connection is
// still live, so a writer that read the connection before a forget refuses after it, and no rule
// outlives the forget's cleanup. Returns null for a connection that is gone.
export function writeGmailWakeRule(
  deps: GmailDeps,
  request: GmailWakeRuleRequest,
): Promise<SetWakeRule | null> {
  const { connectionID, ...rule } = request;

  return withWriteTransaction(deps.log.writer, async (tx) => {
    if (!(await deps.access.probeLive(tx, connectionID))) {
      return null;
    }

    return setWakeRuleInTransaction(tx, deps.wake.context(), {
      ...rule,
      mailbox: { kind: 'gmail', connectionID },
    });
  });
}
