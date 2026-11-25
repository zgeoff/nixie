import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { buildMailBodyFields } from './build-mail-body-fields';
import { readSendFiles } from './read-send-files';

// The card fields of a mail send. The files of the call are read from the thread that made it, so
// the card names each one the owner approves. A call whose files cannot be read shows none: the
// call is refused before it reaches a card.
export async function readMailBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
  replyExpiryMs: number,
): Promise<BodyFields> {
  const named = request.input['files'];

  const ids = Array.isArray(named)
    ? named.filter((item): item is string => typeof item === 'string')
    : [];

  const files =
    request.thread === null || ids.length === 0
      ? { status: 'ok' as const, files: [] }
      : await readSendFiles(log, request.thread, ids);

  const listed = files.status === 'ok' ? files.files : [];

  return buildMailBodyFields(request, replyExpiryMs, listed);
}
