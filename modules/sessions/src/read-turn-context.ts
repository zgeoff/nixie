import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import { readTurnRetrieval } from './read-turn-retrieval';
import { renderCoreChanges } from './render-core-changes';
import { renderPinnedMemory } from './render-pinned-memory';
import { renderSystemPrompt } from './render-system-prompt';
import { renderTurnPreamble } from './render-turn-preamble';
import type {
  ConversationMemory,
  ConversationRun,
  MemoryItem,
  MemoryLineOptions,
  MemoryRef,
} from './types';

export interface TurnContextQuery {
  readonly taskID: string;

  // the persona's text the step read, and the task's skill catalog, which the system prompt renders
  readonly persona: string;
  readonly skillCatalog: string | null;

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

  // the pinned core's change note, the retrieved facts, the retrieved self-notes and the past
  // messages, as system messages in that order
  readonly preamble: readonly string[];
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  // the sequences of the past messages retrieval placed
  readonly retrievedMessages: readonly number[];
}

// Reads the pinned core and the items and past messages that match your new messages, and renders
// them for the turn, the preamble in the order renderTurnPreamble gives. Recall records the items it
// placed, self-notes included, and the turn's record lists them all.
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
    systemPrompt: renderSystemPrompt(query.persona, query.skillCatalog, lines),
    pinnedMemory,
    preamble: renderTurnPreamble({ changes, retrieval, thread: query.taskID, at }, lines),
    pinnedCore: core.map((item) => toMemoryRef(item)),
    retrieved: [...retrieval.items, ...retrieval.selfNotes].map((item) => toMemoryRef(item)),
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

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
