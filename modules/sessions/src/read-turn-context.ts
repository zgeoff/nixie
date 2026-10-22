import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import { isCoreChanged } from './is-core-changed';
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

  readonly persona: string;
  readonly skillCatalog: string | null;

  readonly batch: readonly LogRecord[];
  readonly previousCore: readonly MemoryRef[] | null;

  readonly isNewSession: boolean;
}

export interface TurnContext {
  readonly systemPrompt: string;

  readonly pinnedMemory: string;

  readonly preamble: readonly string[];
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  readonly retrievedMessages: readonly number[];
}

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

interface PinnedCore {
  readonly core: readonly MemoryItem[];
  readonly lines: MemoryLineOptions;
}

async function readCoreChanges(
  memory: ConversationMemory,
  query: TurnContextQuery,
  pinned: PinnedCore,
): Promise<string | null> {
  const pinnedIDs = new Set(pinned.core.map((item) => item.itemID));

  const previousCore = query.isNewSession ? null : query.previousCore;

  if (previousCore === null || !isCoreChanged(previousCore, pinned.core)) {
    return null;
  }

  const unpinnedShortIDs = await memory.readShortIDs(
    previousCore.filter((ref) => !pinnedIDs.has(ref.itemID)).map((ref) => ref.itemID),
  );

  const use = await memory.readPinnedCoreUse();

  return renderCoreChanges(previousCore, pinned.core, { ...pinned.lines, unpinnedShortIDs, use });
}

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
