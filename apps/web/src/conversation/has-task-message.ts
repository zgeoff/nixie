import { buildActivity } from './build-activity';
import type { LiveRecord } from './use-live-records';

export function hasTaskMessage(records: readonly LiveRecord[], messageID: string): boolean {
  return buildActivity(records).some((item) => {
    if (item.kind === 'taskMessage') {
      return item.message.messageID === messageID;
    }

    return (
      item.kind === 'step' &&
      (item.sentMessages ?? []).some((message) => message.messageID === messageID)
    );
  });
}
