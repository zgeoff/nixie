import type { BodyFields, BodyFieldsRequest } from '@heynixie/connections';
import type { JSONObject, Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import { buildGmailSendFields } from './build-gmail-send-fields';
import { buildGmailWakeFields } from './build-gmail-wake-fields';
import { formatCardNames } from './format-card-names';
import { parseCardAttachment } from './gmail-card';
import { gmailToolNames } from './gmail-tool-names';
import { readDestinationPermissions } from './read-destination-permissions';

const sendTools: ReadonlySet<string> = new Set([
  gmailToolNames.send,
  gmailToolNames.reply,
  gmailToolNames.sendDraft,
]);

// The extra card fields of a Gmail call, from the facts that `prepare` read from Google and sealed
// with the call. A send whose card was erased reads as unreadable, so a forget leaves no card that
// shows another mail.
export async function readGmailBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool === gmailToolNames.label) {
    return buildLabelFields(request.input);
  }

  if (request.tool === gmailToolNames.wakeSet) {
    return buildGmailWakeFields(request.input);
  }

  if (!sendTools.has(request.tool)) {
    return { status: 'none' };
  }

  const attachments = await readRecordAttachments(log, [request.callSequence]);

  const stored = attachments.get(request.callSequence);
  const bytes = stored?.status === 'readable' ? stored.attachments[0] : undefined;
  const card = bytes === undefined ? null : parseCardAttachment(bytes);

  if (card === null) {
    return { status: 'unreadable' };
  }

  const permissions = await readDestinationPermissions(log, request.callSequence);

  return buildGmailSendFields(request.tool, card, permissions);
}

function buildLabelFields(input: JSONObject): BodyFields {
  const threads = Array.isArray(input['threads']) ? input['threads'].length : 0;

  return {
    status: 'fields',
    fields: {},
    sentence: `Label ${String(threads)} threads: add ${formatCardNames(input['add'])}, remove ${formatCardNames(input['remove'])}`,
    approveLabel: 'Label',
  };
}
