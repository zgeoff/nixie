import { createShortID } from '@heynixie/db';
import type { WriteTransaction } from '@heynixie/log';
import type { CodeFilesTables } from './code-files-tables';
import { pickMediaType } from './pick-media-type';

export interface StoredFileRequest {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;

  // the thread whose runs may use the file
  readonly thread: string;
}

export interface StoredFile {
  // the file's short ID, which file.send and the tools that take files read
  readonly file: string;
  readonly mediaType: string;

  // the files list of a code run's result, which names the file for every reader of the store
  readonly files: readonly {
    readonly file: string;
    readonly path: string;
    readonly bytes: number;
    readonly mediaType: string;
    readonly isShown: boolean;
  }[];
  readonly attachments: readonly Uint8Array<ArrayBuffer>[];

  // writes the file's row in the transaction of the result record that holds its bytes
  readonly writeBeside: (tx: WriteTransaction, sequence: number) => Promise<void>;
}

// Keeps bytes as a file of the thread, the way computer.export_file does: the bytes are the result
// record's attachment, and a row beside the record names the file. The result that carries `files`
// and `attachments` makes the file usable by file.send and by the tools that take file IDs.
export function buildStoredFile(request: StoredFileRequest): StoredFile {
  const file = createShortID();
  const mediaType = pickMediaType(request.name, request.bytes);

  return {
    file,
    mediaType,
    files: [
      { file, path: request.name, bytes: request.bytes.byteLength, mediaType, isShown: false },
    ],
    attachments: [request.bytes],
    writeBeside: async (tx, sequence) => {
      await tx
        .$extendTables<CodeFilesTables>()
        .insertInto('code_files')
        .values({
          file_id: file,
          thread: request.thread,
          sequence,
          position: 0,
          bytes: request.bytes.byteLength,
          media_type: mediaType,
        })
        .execute();
    },
  };
}
