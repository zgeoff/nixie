import { toContractMemoryItem } from '../contract/to-contract-memory-item';
import { toContractMemoryVersion } from '../contract/to-contract-memory-version';
import { forgetReplySchemas } from '../forget/forget-reply-schemas';
import { readForgetStatusReply } from '../forget/read-forget-status-reply';
import { runForgetReply } from '../forget/run-forget-reply';
import { ownerProvenance } from '../owner/owner-provenance';
import type { APIContext, ReadViewMemory } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireViewMemory } from '../utils/require-view-memory';
import { requireCaller } from './require-caller';
import { runMemoryChange } from './run-memory-change';
import { toMemoryChangeError } from './to-memory-change-error';

export function createMemoryForgetProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    previewForget: memory.previewForget.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const preview = await store.view.readForgetPreview(options.input).catch((error: unknown) => {
        throw toMemoryChangeError(error, options.errors);
      });

      return {
        ...toContractMemoryItem(preview),
        versions: preview.versions.map((version) => toContractMemoryVersion(version)),
        lost: preview.lost,
      };
    }),

    forget: memory.forget.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID };

      const store = await runMemoryChange({ context, readMemory }, options, (memoryStore) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.forget',
        input: target,
        result,
        apply: (writeInTransaction, checkInTransaction) =>
          memoryStore.forget({
            target,
            provenance: ownerProvenance,
            writeInTransaction,
            checkInTransaction,
            isFinishDeferred: true,
          }),
      }));

      return runForgetReply(context, store, {
        clientActionID: options.input.clientActionID,
        result,
        itemIDs: [target.itemID],
        schema: forgetReplySchemas.item,
        toReply: (reply) => ({
          ...result,
          pending: reply.pending.length > 0,
          backup: reply.backup,
        }),
      });
    }),

    previewForgetRetired: memory.previewForgetRetired.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const preview = await store.view.readRetiredForgetPreview();

      return {
        items: preview.items.map((item) => ({ ...toContractMemoryItem(item), lost: item.lost })),
        hasMore: preview.hasMore,
      };
    }),

    forgetRetired: memory.forgetRetired.handler(async (options) => {
      const targets = options.input.targets.map((target) => ({
        itemID: target.itemID,
        version: target.version,
      }));

      const itemIDs = targets.map((target) => target.itemID);

      const store = await runMemoryChange({ context, readMemory }, options, (memoryStore) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.forgetRetired',
        input: { targets },
        result: { itemIDs },
        apply: (writeInTransaction, checkInTransaction) =>
          memoryStore.forgetRetired({
            targets,
            provenance: ownerProvenance,
            writeInTransaction,
            checkInTransaction,
            isFinishDeferred: true,
          }),
      }));

      return runForgetReply(context, store, {
        clientActionID: options.input.clientActionID,
        result: { itemIDs },
        itemIDs,
        schema: forgetReplySchemas.bulk,
        toReply: (reply) => reply,
      });
    }),

    readForgetStatus: memory.readForgetStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const status = await store.view.readForgetStatus(options.input.itemIDs);

      return readForgetStatusReply(context, options.input.itemIDs, status);
    }),
  };
}
