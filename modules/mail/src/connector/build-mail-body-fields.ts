import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { formatDurationText } from '@heynixie/triggers';
import { mailToolNames } from './mail-tool-names';
import type { SendFile } from './read-send-files';

const sendTools: ReadonlySet<string> = new Set([mailToolNames.send, mailToolNames.reply]);

// The card fields of a send: the reply rule that an approval sets, as the length the call names or
// the deployment's reply expiry when it names none, and each file the mail carries, by name and
// size. The card line replaces the input's own `replyWake`, so a send with none still shows it.
export function buildMailBodyFields(
  request: BodyFieldsRequest,
  replyExpiryMs: number,
  files: readonly SendFile[],
): BodyFields {
  if (!sendTools.has(request.tool)) {
    return { status: 'none' };
  }

  return {
    status: 'fields',
    fields: {
      replyWake: pickReplyRule(request.input['replyWake'], replyExpiryMs),
      ...(files.length === 0 ? {} : { files: files.map((file) => formatFile(file)).join(', ') }),
    },
  };
}

function pickReplyRule(named: unknown, replyExpiryMs: number): string {
  if (named === 'off') {
    return 'off: no reply rule';
  }

  return typeof named === 'string' ? named : `${formatDurationText(replyExpiryMs)}, the default`;
}

function formatFile(file: SendFile): string {
  return `${file.name} (${formatSize(file.bytes)})`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  }

  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${String(bytes)} B`;
}
