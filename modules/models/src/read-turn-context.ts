import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import { readDeliveredVersions } from './read-delivered-versions';
import { renderCoreChanges } from './render-core-changes';
import { renderPinnedMemory } from './render-pinned-memory';
import { renderRetrievedItems } from './render-retrieved-items';
import type { SystemMessageType } from './render-system-message';
import { renderSystemMessage } from './render-system-message';
import { renderSystemPrompt } from './render-system-prompt';
import type { ConversationRun, MemoryItem, MemoryRef } from './types';

export interface TurnContextQuery {
  readonly taskID: string;

  // the inbox records the turn takes
  readonly batch: readonly LogRecord[];
  readonly previousCore: readonly MemoryRef[] | null;

  // whether the turn runs on a new session, which holds no item yet
  readonly isNewSession: boolean;
}

// What memory adds to one turn: the system prompt, the pinned core that a new session opens with,
// the blocks that go before the turn's first message, and the references the turn's record lists.
export interface TurnContext {
  readonly systemPrompt: string;

  // the body of a new session's pinned-memory message, which a resumed session never reads
  readonly pinnedMemory: string;

  // the pinned core's change note and the retrieved items, in that order, each as a system message
  readonly preamble: readonly string[];
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];
}

// Reads the pinned core and the items that match your new messages, and renders them for the turn.
// Retrieval searches your messages' text less your name and the agent's, which most items hold,
// leaves out pinned items and versions the session holds, and records what it placed through recall.
export async function readTurnContext(
  run: Pick<
    ConversationRun,
    'context' | 'memory' | 'memorySettings' | 'getSystemPrompt' | 'defaultZone'
  >,
  query: TurnContextQuery,
): Promise<TurnContext> {
  const memory = run.memory();
  const core = await memory.readPinnedCore();
  const retrieved = await readRetrievedItems(run, query);
  const lines = {
    ownerName: run.memorySettings.ownerName,
    defaultZone: run.defaultZone,
    now: new Date(run.context.clock.now()),
  };
  const at = formatMessageTime(lines.now, null, lines);
  const pinned = new Set(core.map((item) => item.itemID));

  // a new session opens with the current core, so only a resumed one gets the change note
  const previousCore = query.isNewSession ? null : query.previousCore;

  // the items that left the core show by their short IDs too
  const unpinnedShortIDs = await memory.readShortIDs(
    (query.previousCore ?? []).filter((ref) => !pinned.has(ref.itemID)).map((ref) => ref.itemID),
  );

  return {
    systemPrompt: renderSystemPrompt(run.getSystemPrompt(), lines),
    pinnedMemory: renderPinnedMemory(core, lines),
    preamble: [
      renderPreambleMessage(
        'pinned-memory-changes',
        at,
        renderCoreChanges(previousCore, core, unpinnedShortIDs),
      ),
      renderPreambleMessage('retrieved-memory', at, renderRetrievedItems(retrieved, lines)),
    ].filter((block) => block !== null),
    pinnedCore: core.map((item) => toMemoryRef(item)),
    retrieved: retrieved.map((item) => toMemoryRef(item)),
  };
}

function renderPreambleMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}

async function readRetrievedItems(
  run: Pick<ConversationRun, 'context' | 'memory' | 'memorySettings'>,
  query: TurnContextQuery,
): Promise<readonly MemoryItem[]> {
  const text = query.batch
    .flatMap((record) => {
      const message = findMessageText(record);

      return message === null ? [] : [message];
    })
    .join('\n');

  if (text.trim() === '') {
    return [];
  }
  const result = await run.memory().recall({
    query: text,
    limit: run.memorySettings.retrievalItems,
    minScore: run.memorySettings.retrievalMinScore,
    excludePinned: true,
    excludedVersions: query.isNewSession
      ? []
      : await readDeliveredVersions(run.context, query.taskID),
    excludedWords: [
      ...run.memorySettings.agentNames,
      ...(run.memorySettings.ownerName === null ? [] : [run.memorySettings.ownerName]),
    ],
    thread: query.taskID,
  });

  return result.items;
}

// your readable words in a message record; a forgotten one gives retrieval nothing to search
function findMessageText(record: LogRecord): string | null {
  if (record.kind !== 'owner_message' || record.erasable.status !== 'readable') {
    return null;
  }
  const text = record.erasable.fields['text'];

  return typeof text === 'string' ? text : null;
}

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
