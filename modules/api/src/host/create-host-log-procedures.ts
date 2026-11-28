// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { runLogExport } from '@heynixie/log';
import type { DecisionPoint } from '@heynixie/policy';
import { buildLogExportCall } from '@heynixie/policy';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

// The export passes the decision point under its own declared effect, as a tool call does. Only a
// deny stops it: the command is the user's own request, so it answers an ask or a missing rule.
export function createHostLogProcedures(context: APIContext, decide: DecisionPoint) {
  return {
    export: hostImplementer.log.export.handler(async (options) => {
      const path = options.input.path;

      const policy = await decide(
        buildLogExportCall({
          path,
          snapshot: context.definitions().snapshotHash,
          at: context.clock.now(),
        }),
      );

      if (policy.decision.outcome === 'deny') {
        throw options.errors.EXPORT_DENIED({
          message: policy.sentence ?? 'a rule in force denies the export',
        });
      }

      try {
        const exported = await runLogExport(context.log, path);

        return { path, ...exported, exportedAt: new Date(context.clock.now()) };
      } catch (error) {
        if (isUnwritable(error)) {
          throw options.errors.EXPORT_PATH_UNWRITABLE({
            message: `nixie cannot create a file at ${path}: ${error.message}`,
          });
        }

        throw error;
      }
    }),
  };
}

const unwritableCodes: ReadonlySet<string> = new Set([
  'ENOENT',
  'ENOTDIR',
  'EACCES',
  'EPERM',
  'EISDIR',
  'EROFS',
]);

function isUnwritable(error: unknown): error is Error {
  return error instanceof Error && 'code' in error && unwritableCodes.has(String(error.code));
}
