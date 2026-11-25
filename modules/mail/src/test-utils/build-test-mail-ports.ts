import { parseLinkMarks } from '@heynixie/wire';
import type { MailFileEntry, MailFileRead, MailPorts } from '../types';

export interface TestMailFile {
  readonly thread: string;
  readonly name: string;
  readonly content: Uint8Array<ArrayBuffer>;
}

export interface TestMailPorts extends MailPorts {
  // puts a file in the files of a thread, and returns its file ID
  readonly addFile: (file: TestMailFile) => string;
}

// The ports of the mail module in a test: the code files of a thread in memory, and link IDs that
// count up in each session, the same for an address that came again. An integration test wires the
// real ones, which the server owns.
export function buildTestMailPorts(): TestMailPorts {
  const files = new Map<string, TestMailFile>();
  const numbers = new Map<string, Map<string, number>>();

  const getNumber = (sessionKey: string, url: string): number => {
    const session = numbers.get(sessionKey) ?? new Map<string, number>();

    numbers.set(sessionKey, session);

    const known = session.get(url);

    if (known !== undefined) {
      return known;
    }

    const next = session.size + 1;

    session.set(url, next);

    return next;
  };

  const readEntry = (fileID: string): Promise<MailFileEntry> => {
    const file = files.get(fileID);

    if (file === undefined) {
      return Promise.resolve({ kind: 'missing' });
    }

    return Promise.resolve({
      kind: 'ok',
      row: { thread: file.thread, bytes: file.content.byteLength, mediaType: 'text/plain' },
      name: file.name,
      isStream: false,
    });
  };

  const readFile = (thread: string, fileID: string): Promise<MailFileRead> => {
    const file = files.get(fileID);

    if (file === undefined || file.thread !== thread) {
      return Promise.resolve({ kind: 'missing' });
    }

    return Promise.resolve({ kind: 'ok', bytes: file.content });
  };

  return {
    addFile: (file) => {
      const fileID = `ftest${String(files.size + 1).padStart(6, '0')}`;

      files.set(fileID, file);

      return fileID;
    },
    readEntry,
    readFile,
    buildStoredFile: (request) => ({
      file: 'fstored0001',
      mediaType: 'application/octet-stream',
      files: [
        {
          file: 'fstored0001',
          path: request.name,
          bytes: request.bytes.byteLength,
          mediaType: 'application/octet-stream',
          isShown: false,
        },
      ],
      attachments: [request.bytes],
      writeBeside: () => Promise.resolve(),
    }),
    writeLinkTags: (run, request) =>
      Promise.resolve(
        new Map(
          request.urls.map((url) => [
            url,
            formatTag(getNumber(run.session?.key ?? run.runID, url), url),
          ]),
        ),
      ),
    writeLinkedText: (run, request) =>
      Promise.resolve(
        parseLinkMarks(request.text)
          .map((part) => {
            if (typeof part === 'string') {
              return part;
            }

            const target = request.links[part.link];

            return target === undefined
              ? ''
              : formatTag(getNumber(run.session?.key ?? run.runID, target), target);
          })
          .join(''),
      ),
  };
}

function formatTag(number: number, url: string): string {
  const parsed = URL.parse(url);

  if (parsed === null) {
    return `[L${String(number)}]`;
  }

  const path = parsed.pathname === '/' ? '' : parsed.pathname;

  return `[L${String(number)} · ${parsed.hostname}${path}]`;
}
