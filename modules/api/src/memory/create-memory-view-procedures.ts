// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { MemorySubject, ViewPageRequest } from '@heynixie/memory';
import { InvalidCursorError } from '@heynixie/memory';
import { toContractMemoryItem } from '../contract/to-contract-memory-item';
import { toContractMemoryVersion } from '../contract/to-contract-memory-version';
import type { APIContext, ReadViewMemory } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireViewMemory } from '../utils/require-view-memory';
import { requireCaller } from './require-caller';

export function createMemoryViewProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    listItems: memory.listItems.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const page = await store.view
        .readPage(toPageRequest(options.input))
        .catch((error: unknown) => {
          throw error instanceof InvalidCursorError ? options.errors.INVALID_CURSOR() : error;
        });

      return { items: page.items.map((item) => toContractMemoryItem(item)), next: page.next };
    }),

    findItems: memory.findItems.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const found = await store.view.readMatchingItems(options.input.query);

      return {
        items: found.items.map((match) => ({
          ...toContractMemoryItem(match),
          ...(match.score === undefined ? {} : { score: match.score }),
          ...(match.similarity === undefined ? {} : { similarity: match.similarity }),
        })),
        searchMode: found.searchMode,
      };
    }),

    readPinnedCore: memory.readPinnedCore.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const core = await store.view.readPinnedCore();

      return {
        items: core.items.map((item) => toContractMemoryItem(item)),
        tokens: core.tokens,
        budget: core.budget,
      };
    }),

    readItem: memory.readItem.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const detail = await store.view.readItem(options.input.itemID);

      if (detail === null) {
        throw options.errors.MEMORY_ITEM_NOT_FOUND();
      }

      return {
        ...toContractMemoryItem(detail),
        versions: detail.versions.map((version) => toContractMemoryVersion(version)),
      };
    }),
  };
}

interface PageInput {
  readonly state: ViewPageRequest['state'];
  readonly after?: string | undefined;
  readonly kind?: 'fact' | 'self' | undefined;
  readonly limit?: number | undefined;
}

const subjectsByKind: Readonly<Record<'fact' | 'self', readonly MemorySubject[]>> = {
  fact: ['owner', 'shared'],
  self: ['self'],
};

function toPageRequest(input: PageInput): ViewPageRequest {
  return {
    state: input.state,
    ...(input.after === undefined ? {} : { after: input.after }),
    ...(input.kind === undefined ? {} : { subjects: subjectsByKind[input.kind] }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  };
}
