import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { PageShape } from '../recall/build-page-outcome';
import { buildPageOutcome } from '../recall/build-page-outcome';
import type { RecallLineOptions } from '../recall/build-recall-tool';
import { recallLimits } from '../recall/recall-limits';
import { buildUsageCursor } from './build-usage-cursor';
import type { UsageListEntry } from './collect-usage-list';
import { compareUsagePosition } from './compare-usage-position';
import { formatUsageLine } from './format-usage-line';
import { parseUsageCursor } from './parse-usage-cursor';

const maxDays = 3650;

const usageInput = {
  type: 'object',
  properties: {
    days: {
      type: 'integer',
      minimum: 1,
      maximum: maxDays,
      description: 'list the items that no search or push surfaced in this many days',
    },
    cursor: {
      type: 'string',
      pattern: String.raw`^(never|[0-9]+)\.[0-9]+$`,
      description: 'the next cursor from the page before',
    },
  },
  required: ['days'],
  additionalProperties: false,
};

const usageOutput = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description:
        'the active items that no search or push surfaced in the period, the ' +
        'never-surfaced first and then the longest unsurfaced',
      items: {
        type: 'object',
        properties: {
          itemID: { type: 'string' },
          topic: { type: 'string' },
          gist: { type: 'string' },
          usage: { type: 'string' },
          neverFiredTriggers: {
            type: 'array',
            items: { type: 'string' },
            description:
              'the trigger phrases of an item that no push ever placed, so none of them fired',
          },
        },
        required: ['itemID', 'topic', 'gist', 'usage', 'neverFiredTriggers'],
        additionalProperties: false,
      },
    },
    next: { type: ['string', 'null'], description: 'pass as cursor to read the next page' },
    searched: { type: 'object', properties: { days: { type: 'integer' } } },
    leftOut: {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        itemIDs: { type: 'array', items: { type: 'string' } },
        versions: { type: 'integer' },
      },
    },
  },
  required: ['items', 'next', 'searched'],
};

const usageArguments = z.object({
  days: z.int().min(1).max(maxDays),
  cursor: z.string().optional(),
});

type UsageDependencies = Pick<StartedMemoryStore, 'readUsageList'>;

// A read of what memory holds that nothing surfaces, so it writes no recalled record and counts
// for no item.
export function buildUsageTool(
  memory: UsageDependencies,
  options: Pick<RecallLineOptions, 'clock' | 'defaultZone'>,
): ToolDefinition {
  return {
    name: 'memory.usage',
    description:
      'Lists the active items that no search or push surfaced in the last days days, with the ' +
      'never-surfaced first and then the longest unsurfaced. Each item shows its ID, topic, gist ' +
      'and usage, and the trigger phrases that never fired. Use it to find items to retire or ' +
      'reword. A page is capped in size: next continues after the last entry shown, and passes ' +
      'back as cursor.',
    input: usageInput,
    output: usageOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        items: 'untrusted',
        next: 'owner_data',
        searched: 'owner_data',
        leftOut: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = usageArguments.parse(call.input);
      const after = parseUsageCursor(input.cursor);

      const entries = await memory.readUsageList({
        days: input.days,
        beforeSequence: context.callSequence,
      });

      const nowMs = options.clock.now();

      const shape: PageShape<UsageListEntry> = {
        key: 'items',
        toEntry: (entry) => ({
          itemID: entry.itemID,
          topic: entry.topic,
          gist: entry.gist,
          usage: formatUsageLine(entry.report, { nowMs, defaultZone: options.defaultZone }),
          neverFiredTriggers: [...entry.neverFiredTriggers],
        }),
        toRecordEntries: (kept) => ({ items: kept.map((entry) => ({ itemID: entry.itemID })) }),
        toUUIDs: (entry) => [[entry.itemID, entry.itemUUID]],
        toCursor: (entry) =>
          buildUsageCursor({
            surfacedAtMs: entry.report.lastSurfacedAtMs,
            createdSequence: entry.createdSequence,
          }),
      };

      const remaining =
        after === null
          ? entries
          : entries.filter(
              (entry) =>
                compareUsagePosition(
                  {
                    surfacedAtMs: entry.report.lastSurfacedAtMs,
                    createdSequence: entry.createdSequence,
                  },
                  after,
                ) > 0,
            );

      return buildPageOutcome(
        { entries: remaining.slice(0, recallLimits.max), total: remaining.length },
        shape,
        { offset: 0, searched: { days: input.days } },
      );
    },
  };
}
