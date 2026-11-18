import { readCodeFileBytes, readCodeFileEntry } from '@heynixie/connectors';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { imageLimits } from '@heynixie/contract';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

const inlineTypes: readonly string[] = imageLimits.mediaTypes;

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
  };
}
