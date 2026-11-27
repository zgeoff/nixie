import { readRecordAttachments } from '@heynixie/log';
import type { JSONObject, Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { parseCardAttachment } from '../gmail/gmail-card';
import { driveToolNames } from './drive-tool-names';

// The extra card fields of a Drive write: the whole text, and the name. A create's card comes from
// the call's input. A change's card also shows the name of the file as `prepare` read it, which the
// call's record seals, so a forget of the record leaves the card unreadable.
export async function readDriveBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool === driveToolNames.create) {
    const name = readText(request.input, 'name');
    const type = readText(request.input, 'as');

    return {
      status: 'fields',
      fields: { name, type, text: readText(request.input, 'text') },
      sentence: `Create "${name}" in Drive`,
      approveLabel: 'Create file',
    };
  }

  if (request.tool !== driveToolNames.change) {
    return { status: 'none' };
  }

  const attachments = await readRecordAttachments(log, [request.callSequence]);

  const stored = attachments.get(request.callSequence);
  const bytes = stored?.status === 'readable' ? stored.attachments[0] : undefined;
  const card = bytes === undefined ? null : parseCardAttachment(bytes);

  if (card === null) {
    return { status: 'unreadable' };
  }

  const name = card['name'] ?? '';
  const rename = card['rename'] ?? '';

  return {
    status: 'fields',
    fields: {
      name,
      ...(rename === '' ? {} : { rename }),
      text: readText(request.input, 'text'),
    },
    sentence: `Replace the content of "${name}"`,
    approveLabel: 'Replace content',
  };
}

function readText(input: JSONObject, key: string): string {
  const value = input[key];

  return typeof value === 'string' ? value : '';
}
