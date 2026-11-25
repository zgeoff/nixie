import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { formatDurationText } from '../tool/format-duration-text';
import { mailToolNames } from './mail-tool-names';

const sendTools: ReadonlySet<string> = new Set([mailToolNames.send, mailToolNames.reply]);

// The reply rule that an approval of a send sets, as the card shows it: the length the call names,
// or the deployment's reply expiry when it names none, which is the length the send resolves. The
// card line replaces the input's own `replyWake`, so a send with none still shows its rule.
export function buildMailBodyFields(request: BodyFieldsRequest, replyExpiryMs: number): BodyFields {
  if (!sendTools.has(request.tool)) {
    return { status: 'none' };
  }

  return {
    status: 'fields',
    fields: { replyWake: pickReplyRule(request.input['replyWake'], replyExpiryMs) },
  };
}

function pickReplyRule(named: unknown, replyExpiryMs: number): string {
  if (named === 'off') {
    return 'off: no reply rule';
  }

  return typeof named === 'string' ? named : `${formatDurationText(replyExpiryMs)}, the default`;
}
