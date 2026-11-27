import { readCodeFile, readCodeFileEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import { maxAttachmentBytes } from '../call/read-attachment-content';

interface SendFile {
  readonly file: string;
  readonly name: string;
  readonly type: string;
  readonly bytes: number;

  // the bytes, when the read asked for them
  readonly content: Uint8Array<ArrayBuffer> | null;
}

export type SendFiles =
  | { readonly status: 'ok'; readonly files: readonly SendFile[] }
  | { readonly status: 'error'; readonly message: string };

interface SendFilesRequest {
  readonly thread: string;
  readonly ids: readonly string[];
  readonly withContent: boolean;
}

// The assistant's own files that a send names, by the file IDs of the thread's code runs. A file of
// another thread reads as unknown, and the files hold no more than a mail carries. The bytes are
// read only when `withContent` is set, as the action that sends needs them.
export async function readSendFiles(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: SendFilesRequest,
): Promise<SendFiles> {
  const files: SendFile[] = [];

  for (const id of request.ids) {
    const entry = await readCodeFileEntry(log, id);

    if (entry.kind === 'missing' || entry.row.thread !== request.thread) {
      return { status: 'error', message: `UNKNOWN_FILE: no file ${id} belongs to this thread` };
    }

    if (entry.kind === 'forgotten' || entry.isStream) {
      return {
        status: 'error',
        message: `UNKNOWN_FILE: the file ${id} is forgotten or is no file`,
      };
    }

    const read = request.withContent
      ? await readCodeFile(log, { thread: request.thread, fileID: id })
      : null;

    if (read !== null && read.kind !== 'ok') {
      return { status: 'error', message: `UNKNOWN_FILE: the file ${id} cannot be read` };
    }

    files.push({
      file: id,
      name: entry.name,
      type: entry.row.mediaType,
      bytes: entry.row.bytes,
      content: read === null || read.kind !== 'ok' ? null : read.bytes,
    });
  }

  const total = files.reduce((sum, file) => sum + file.bytes, 0);

  return total > maxAttachmentBytes
    ? { status: 'error', message: 'TOO_BIG: the files hold more than 25 MiB' }
    : { status: 'ok', files };
}
