import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import type { ConsolidationChange, MemoryConsolidations } from './consolidation-types';
import type { ItemIDStore } from './types';

// What memory.diff reads: the consolidator's pending diff, and the short IDs of the items it names.
export interface DiffToolStore extends Pick<ItemIDStore, 'readShortIDs'> {
  readonly consolidations: Pick<MemoryConsolidations, 'readDelivered'>;
}

const changeInput = {
  type: 'object',
  properties: {
    itemID: { type: 'string' },
    version: { type: 'integer', description: 'the version the change read' },
    text: {
      type: ['string', 'null'],
      description: 'the text at that version, null once forgotten',
    },
    isCurrent: { type: 'boolean', description: 'whether the item still stands at that version' },
  },
  required: ['itemID', 'version', 'text', 'isCurrent'],
};

const diffOutput = {
  type: 'object',
  properties: {
    proposedAt: { type: 'string', description: 'when the consolidator proposed the diff, in UTC' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          changeID: { type: 'string' },
          kind: { type: 'string', enum: ['merge', 'rewrite', 'retire'] },
          inputs: { type: 'array', items: changeInput },
          text: { type: 'string', description: 'the text a merge or a rewrite writes' },
          reason: { type: 'string', description: 'why the consolidator proposes the change' },
          comment: { type: 'string', description: 'the comment you left on the change' },
        },
        required: ['changeID', 'kind', 'inputs', 'reason'],
      },
    },
    summary: {
      type: 'string',
      description:
        'what the consolidator told the owner about the diff, such as items it left alone ' +
        'because they conflict',
    },
  },
  required: ['changes'],
  additionalProperties: false,
};

// Builds memory.diff, which declares read and shows each pending change with its reason, inputs
// and comment, and the consolidator's summary, and never answers one. The inputs hold every source
// memory holds, so the changes and the summary written from them take the most cautious one.
export function buildDiffTool(memory: DiffToolStore): ToolDefinition {
  return {
    name: 'memory.diff',
    description:
      "Shows the weekly memory consolidation's pending diff before the owner reviews it: each " +
      'change, a merge, a rewrite or a retirement, with its ID, the items it reads at their ' +
      'versions, the text it would write, its reason and the comment you left on it, and the ' +
      "consolidator's summary for the owner, such as items it left alone because they " +
      'conflict. An empty list with no summary means no diff waits. Read it when the owner asks about the consolidation, and check ' +
      'each rewrite and merge against what you know of the owner: leave a comment with ' +
      'memory.comment where a change loses a detail, a tone or a joke. Only the owner approves ' +
      'or rejects a change.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: diffOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { proposedAt: 'owner_data', changes: 'untrusted', summary: 'untrusted' },
    },
    execution: 'direct',
    run: async () => {
      const diff = await memory.consolidations.readDelivered();

      if (diff === null) {
        return { status: 'ok', result: { changes: [] }, record: { changes: [] } };
      }

      const shortIDs = await memory.readShortIDs(
        diff.changes.flatMap((change) => change.inputs.map((input) => input.itemID)),
      );

      // the record holds only the change IDs, so a forget leaves no readable copy of the text
      return {
        status: 'ok',
        result: {
          proposedAt: formatProposedAt(diff.createdAt),
          changes: diff.changes.map((change) => toChangeJSON(change, shortIDs)),
          ...(diff.summary === null ? {} : { summary: diff.summary.text }),
        },
        record: { changes: diff.changes.map((change) => ({ changeID: change.changeID })) },
      };
    },
  };
}

// a minute-precise UTC date, such as 2026-10-01 09:30 UTC
function formatProposedAt(time: number): string {
  const iso = new Date(time).toISOString();

  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// the change as the model reads it, with the change and each input named by its short ID
function toChangeJSON(
  change: ConsolidationChange,
  shortIDs: ReadonlyMap<string, string>,
): JSONObject {
  return {
    changeID: change.shortID,
    kind: change.kind,
    inputs: change.inputs.map((input) => ({
      itemID: shortIDs.get(input.itemID) ?? input.itemID,
      version: input.version,
      text: input.text,
      isCurrent: input.isCurrent,
    })),
    ...(change.text === null ? {} : { text: change.text }),
    reason: change.reason,
    ...(change.comment === null ? {} : { comment: change.comment.text }),
  };
}
