import { store } from './store';

const pageSize = 30;

const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

interface MockCodeFilesInput {
  readonly cursor?: string | undefined;
  readonly kind?: 'image' | 'other' | undefined;
}

// The readable files of the mock store, newest run first, in pages of the size the API uses.
export function readMockCodeFiles(input: MockCodeFilesInput) {
  const readable = store.files.all().filter((file) => !file.isForgotten);
  const after = parseMockCursor(input.cursor);

  const matching = readable
    .filter(
      (file) =>
        input.kind === undefined || inlineTypes.has(file.mediaType) === (input.kind === 'image'),
    )
    .filter((file) => after === null || isAfter(file, after))
    .toSorted((left, right) => right.sequence - left.sequence || left.position - right.position);

  const page = matching.slice(0, pageSize);
  const last = page.at(-1);

  return {
    files: page.map((file) => ({
      bytes: atob(file.data).length,
      file: file.file,
      isSent: file.isSent,
      mediaType: file.mediaType,
      name: file.name,
      position: file.position,
      recordedAt: file.recordedAt,
      runFileCount: readable.filter(
        (other) => other.thread === file.thread && other.sequence === file.sequence,
      ).length,
      sequence: file.sequence,
      taskID: file.thread === 'conversation' ? null : file.thread,
      taskName:
        file.thread === 'conversation'
          ? null
          : (store.tasks.findFirst((query) => query.where({ taskID: file.thread }))?.name ??
            file.thread),
      thread: file.thread,
    })),
    nextCursor:
      matching.length > pageSize && last !== undefined ? `${last.sequence}:${last.position}` : null,
  };
}

interface FilePosition {
  readonly sequence: number;
  readonly position: number;
}

function parseMockCursor(cursor: string | undefined): FilePosition | null {
  const found = /^(?<sequence>\d+):(?<position>\d+)$/u.exec(cursor ?? '')?.groups;

  return found === undefined
    ? null
    : { sequence: Number(found['sequence']), position: Number(found['position']) };
}

function isAfter(file: FilePosition, cursor: FilePosition): boolean {
  return (
    file.sequence < cursor.sequence ||
    (file.sequence === cursor.sequence && file.position > cursor.position)
  );
}
