import { apiImplementer } from './api-implementer';
import { ownerProvenance } from './owner-provenance';
import { readKeptVersions } from './read-kept-versions';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { runMemoryChange } from './run-memory-change';
import { toContractMemoryItem } from './to-contract-memory-item';
import type { APIContext, ReadViewMemory } from './types';

export function createMemoryNoticeProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;
  const parts = { context, readMemory };

  return {
    listNotices: memory.listNotices.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const notices = await store.view.readNotices(options.input.thread);

      const kept = await readKeptVersions(context, [
        ...new Set(notices.flatMap((notice) => notice.entries.map((entry) => entry.itemID))),
      ]);

      return {
        notices: notices.map((notice) => ({
          noticeKey: notice.noticeKey,
          kind: notice.kind,
          messageSequence: notice.messageSequence,
          sequence: notice.sequence,
          remembered: notice.remembered,
          retired: notice.retired,
          proposed: notice.proposed,
          entries: notice.entries.map((entry) => ({
            change: entry.change,
            isKept: entry.version !== null && kept.has(`${entry.itemID}/${String(entry.version)}`),
            item:
              entry.item === null
                ? null
                : { ...toContractMemoryItem(entry.item), change: entry.item.change },
            itemID: entry.itemID,
            proposalID: entry.proposalID,
            sequence: entry.sequence,
            version: entry.version,
          })),
        })),
      };
    }),

    undo: memory.undo.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID, version: target.version + 1 };

      await runMemoryChange(parts, options, (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.undo',
        input: target,
        result,
        apply: (writeInTransaction) =>
          store.undo({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    keep: memory.keep.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };

      await runMemoryChange(parts, options, (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.keep',
        input: target,
        result: target,
        apply: (writeInTransaction) => store.keep({ target, writeInTransaction }),
      }));

      return target;
    }),
  };
}
