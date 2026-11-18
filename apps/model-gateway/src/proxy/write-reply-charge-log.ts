import type { Logger } from '@heynixie/logger';
import type { CountedReply } from './accounting';
import type { ReplyCharge } from './pick-reply-charge';

export function writeReplyChargeLog(log: Logger, reply: CountedReply, charge: ReplyCharge): void {
  if (charge.kind === 'lost') {
    log(
      'count.lost',
      { route: reply.routeID, sandbox: reply.sandbox, field: charge.field },
      'error',
    );
  }

  if (charge.kind === 'estimate') {
    log(
      'count.estimated',
      {
        route: reply.routeID,
        sandbox: reply.sandbox,
        reason: reply.reason,
        dollars: charge.spend.dollars,
        tokens: charge.spend.tokens,
      },
      'warn',
    );
  }
}
