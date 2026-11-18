import { listCodeFiles, readCodeFileBytes, readCodeFileEntry } from '@heynixie/connectors';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { imageLimits } from '@heynixie/contract';
import { readTaskDirectory } from '@heynixie/tasks';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

const inlineTypes: readonly string[] = imageLimits.mediaTypes;
const pageSize = 30;

export function createFilesProcedures(context: APIContext) {
  return {
    read: apiImplementer.files.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const entry = await readCodeFileEntry(context.log, options.input.file);

      if (entry.kind === 'missing') {
        throw options.errors.FILE_NOT_FOUND();
      }

      const bytes =
        entry.kind === 'ok' ? await readCodeFileBytes(context.log, entry.row) : undefined;

      if (entry.kind !== 'ok' || bytes === undefined) {
        throw options.errors.FILE_FORGOTTEN();
      }

      // The program wrote the bytes and the session's origin loads them, so only the image types
      // that nixie sniffed from the bytes keep their type.
      const type = inlineTypes.includes(entry.row.mediaType)
        ? entry.row.mediaType
        : 'application/octet-stream';

      return new File([bytes], entry.name, { type });
    }),

    list: apiImplementer.files.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const page = await listCodeFiles(context.log, {
        cursor: options.input.cursor,
        kind: options.input.kind,
        limit: pageSize,
      });

      const messaging = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      const names = new Map(messaging.directory.map((task) => [task.taskID, task.name]));

      return {
        nextCursor: page.nextCursor,
        files: page.files.map((file) => ({
          file: file.file,
          name: file.name,
          bytes: file.bytes,
          mediaType: file.mediaType,
          recordedAt: file.recordedAt,
          thread: file.thread,
          sequence: file.sequence,
          position: file.position,
          isSent: file.isSent,
          runFileCount: file.runFileCount,
          taskID: file.thread === 'conversation' ? null : file.thread,
          taskName: file.thread === 'conversation' ? null : (names.get(file.thread) ?? file.thread),
        })),
      };
    }),
  };
}
