import { readCodeFile, readCodeFileEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import { maxAttachmentBytes } from '../store/count-stored-attachments';

export interface SendFile {
  readonly file: string;
  readonly name: string;
  readonly bytes: number;
  readonly mediaType: string;
}

export type SendFiles =
  | { readonly status: 'ok'; readonly files: readonly SendFile[] }
  | { readonly status: 'error'; readonly message: string };

// The files that a send names, by the file IDs of the thread's runs: each file's name and size, or
// the first reason one cannot go. A file of another thread reads as unknown, as it does for
// file.send, and the files hold no more than a mail carries.
export async function readSendFiles(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  ids: readonly string[],
): Promise<SendFiles> {
  const files: SendFile[] = [];

  for (const id of ids) {
    const entry = await readCodeFileEntry(log, id);

    if (entry.kind === 'missing' || entry.row.thread !== thread) {
      return { status: 'error', message: `UNKNOWN_FILE: no file ${id} belongs to this thread` };
    }

    if (entry.kind === 'forgotten' || entry.isStream) {
      return {
        status: 'error',
        message: `UNKNOWN_FILE: the file ${id} is forgotten or is no file`,
      };
    }

    files.push({
      file: id,
      name: entry.name,
      bytes: entry.row.bytes,
      mediaType: entry.row.mediaType,
    });
  }

  const total = files.reduce((sum, file) => sum + file.bytes, 0);

  return total > maxAttachmentBytes
    ? { status: 'error', message: 'TOO_BIG: the files hold more than 25 MiB' }
    : { status: 'ok', files };
}

export interface SendFileContent extends SendFile {
  readonly content: Uint8Array<ArrayBuffer>;
}

export type SendFileContents =
  | { readonly status: 'ok'; readonly files: readonly SendFileContent[] }
  | { readonly status: 'error'; readonly message: string };

// The names and the bytes of the files that a send names, read when the send runs. A file that a
// forget took since the call makes the send refuse.
export async function readSendFileContents(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  ids: readonly string[],
): Promise<SendFileContents> {
  const named = await readSendFiles(log, thread, ids);

  if (named.status === 'error') {
    return named;
  }

  const files: SendFileContent[] = [];

  for (const file of named.files) {
    const read = await readCodeFile(log, { thread, fileID: file.file });

    if (read.kind !== 'ok') {
      return { status: 'error', message: `UNKNOWN_FILE: the file ${file.file} cannot be read` };
    }

    files.push({ ...file, content: read.bytes });
  }

  return { status: 'ok', files };
}
