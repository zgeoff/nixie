import type { LogRecord } from '@heynixie/log';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import { readTurnRetrieval } from './read-turn-retrieval';
import { renderCoreChanges } from './render-core-changes';
import { renderPinnedMemory } from './render-pinned-memory';
import { renderRetrievedItems } from './render-retrieved-items';
import { renderRetrievedMessages } from './render-retrieved-messages';
import { renderSystemPrompt } from './render-system-prompt';
import type {
  ConversationMemory,
  ConversationRun,
  MemoryItem,
  MemoryLineOptions,
  MemoryRef,
} from './types';

export interface TurnContextQuery {
  readonly taskID: string;

  // the persona's text the step read, which the system prompt renders
  readonly persona: string;

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

  // the pinned core's change note, the retrieved items and the past messages, as system messages
  readonly preamble: readonly string[];
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  // the sequences of the past messages retrieval placed
  readonly retrievedMessages: readonly number[];
}

// Reads the pinned core and the items and past messages that match your new messages, and renders
// them for the turn. Recall records the items it placed, and the turn's record lists both.
export async function readTurnContext(
  run: Pick<ConversationRun, 'context' | 'memory' | 'memorySettings' | 'defaultZone'>,
  query: TurnContextQuery,
): Promise<TurnContext> {
  const memory = run.memory();

  const lines = {
    ownerName: run.memorySettings.ownerName,
    defaultZone: run.defaultZone,
    now: new Date(run.context.clock.now()),
  };

  const core = await memory.readPinnedCore();
  const retrieval = await readTurnRetrieval(run, query, lines);

  const at = formatMessageTime(lines.now, null, lines);
  const pinnedMemory = renderPinnedMemory(core, lines);

  const changes = await readCoreChanges(memory, query, { core, lines });

  return {
    systemPrompt: renderSystemPrompt(query.persona, lines),
    pinnedMemory,
    preamble: [
      renderPreambleMessage('pinned-memory-changes', at, changes),
      renderPreambleMessage('retrieved-memory', at, renderRetrievedItems(retrieval.items, lines)),
      renderPreambleMessage(
        'retrieved-messages',
        at,
        renderRetrievedMessages(retrieval.messages, { ...lines, thread: query.taskID }),
      ),
    ].filter((block) => block !== null),
    pinnedCore: core.map((item) => toMemoryRef(item)),
    retrieved: retrieval.items.map((item) => toMemoryRef(item)),
    retrievedMessages: retrieval.messages.map((message) => message.sequence),
  };
}

// the pinned core this turn runs with, and the options its lines render with
interface PinnedCore {
  readonly core: readonly MemoryItem[];
  readonly lines: MemoryLineOptions;
}

// The change note's body. A new session opens with the current core, so only a resumed one gets a
// note, and the items that left the core show by their short IDs too.
async function readCoreChanges(
  memory: ConversationMemory,
  query: TurnContextQuery,
  pinned: PinnedCore,
): Promise<string | null> {
  const pinnedIDs = new Set(pinned.core.map((item) => item.itemID));

  const previousCore = query.isNewSession ? null : query.previousCore;

  const unpinnedShortIDs = await memory.readShortIDs(
    (previousCore ?? []).filter((ref) => !pinnedIDs.has(ref.itemID)).map((ref) => ref.itemID),
  );

  return renderCoreChanges(previousCore, pinned.core, { ...pinned.lines, unpinnedShortIDs });
}

function renderPreambleMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
