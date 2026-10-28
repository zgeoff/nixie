// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readRecords } from '@heynixie/log';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toContractMomentSummary } from './to-contract-moment-summary';
import { toMomentSpanRecord } from './to-moment-span-record';
import type { APIContext, ReadViewMemory, ViewMemoryStore } from './types';

const timelinePageSize = 50;
const spanPageSize = 100;

export function createMomentReadProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    // A search returns its best matches in one page, which the timeline shows in time order.
    listMoments: memory.listMoments.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);
      const input = options.input;

      const page = await store.moments.readMatches({
        words: (input.query ?? '').split(/\s+/u).filter((word) => word !== ''),
        from: null,
        to: null,
        includeRetired: input.includeRetired,
        before: input.before ?? null,
        limit: timelinePageSize,
      });

      return {
        moments: page.matches
          .toSorted((left, right) => right.row.kept_sequence - left.row.kept_sequence)
          .map((match) => toContractMomentSummary(match.row, match.title)),
        next: page.next,
      };
    }),

    readMoment: memory.readMoment.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const view = await store.moments.readView(options.input.momentID);

      if (view === null) {
        throw options.errors.MOMENT_NOT_FOUND();
      }

      const row = view.row;

      return {
        ...toContractMomentSummary(row, view.title),
        firstSequence: row.first_sequence,
        lastSequence: row.last_sequence,
        links: await readLinkedItems(store, view.linkedItemIDs),
        note:
          view.note === null
            ? null
            : { text: view.note.text, writtenAt: new Date(view.note.writtenAt) },
        reflections: view.reflections.map((reflection) => ({
          model: reflection.model,
          reflectionID: reflection.reflectionID,
          text: reflection.text,
          writtenAt: new Date(reflection.writtenAt),
        })),
        thread: row.thread,
        titleBy: view.titleBy,
        version: row.version,
      };
    }),

    readMomentSpan: memory.readMomentSpan.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const view = await store.moments.readView(options.input.momentID);

      if (view === null) {
        throw options.errors.MOMENT_NOT_FOUND();
      }

      const row = view.row;

      const read = await readRecords(context.log, {
        afterSequence: Math.max(options.input.after ?? 0, row.first_sequence - 1),
        beforeSequence: row.last_sequence + 1,
        thread: row.thread,
        limit: spanPageSize + 1,
      });

      const page = read.slice(0, spanPageSize);
      const last = page.at(-1);

      return {
        records: page.map((entry) => toMomentSpanRecord(entry.record)),
        next: read.length > spanPageSize && last !== undefined ? last.record.sequence : null,
      };
    }),
  };
}

async function readLinkedItems(store: ViewMemoryStore, itemIDs: readonly string[]) {
  const items = await Promise.all(itemIDs.map((itemID) => store.view.readItem(itemID)));

  return items.flatMap((item) =>
    item === null
      ? []
      : [
          {
            itemID: item.itemID,
            shortID: item.shortID,
            text: item.status === 'readable' ? item.text : null,
          },
        ],
  );
}
