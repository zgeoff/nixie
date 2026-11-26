import type { WakeRule } from '@heynixie/triggers';
import { readWakeRules } from '@heynixie/triggers';
import type { Kysely } from 'kysely';

export interface ReplyRulesRequest {
  readonly connectionID: string;

  // epoch ms: a rule that expired by then is left out
  readonly at: number;
}

// The live reply rules of one Gmail connection: the rules that a send registered.
export async function readGmailReplyRules(
  db: Kysely<unknown>,
  request: ReplyRulesRequest,
): Promise<readonly WakeRule[]> {
  const rules = await readWakeRules(db, {
    mailbox: { kind: 'gmail', connectionID: request.connectionID },
    at: request.at,
  });

  return rules.filter((rule) => rule.origin === 'reply');
}
