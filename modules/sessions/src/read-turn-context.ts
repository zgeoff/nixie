import type { LogRecord } from '@heynixie/log';
import type { PromptOverrides } from '@heynixie/prompts';
import type { TaskBrief } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import { isCoreChanged } from './is-core-changed';
import type { TurnRetrieval } from './read-turn-retrieval';
import { readTurnRetrieval } from './read-turn-retrieval';
import { renderBriefEnvelope } from './render-brief-envelope';
import { renderCoreChanges } from './render-core-changes';
import { renderPinnedMemory } from './render-pinned-memory';
import { renderSessionPrompt } from './render-session-prompt';
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
  readonly prompts: PromptOverrides;
  readonly skillCatalog: string | null;

  readonly batch: readonly LogRecord[];

  // the task's own brief, or null for a task with none
  readonly brief: TaskBrief | null;
  readonly previousCore: readonly MemoryRef[] | null;

  readonly isNewSession: boolean;

  readonly isFirstSession: boolean;

  // whether the turn carries on the work that an interrupt cut, with no new message to start it
  readonly isContinuation: boolean;
}

export interface TurnContext {
  readonly systemPrompt: string;

  readonly pinnedMemory: string | null;

  readonly preamble: readonly string[];
  readonly pinnedCore: readonly MemoryRef[];
  readonly retrieved: readonly MemoryRef[];

  readonly retrievedMessages: readonly number[];
}

type TurnContextRun = Pick<
  ConversationRun,
  'context' | 'frame' | 'memory' | 'memorySettings' | 'defaultZone' | 'messaging'
>;

const noRetrieval: TurnRetrieval = { items: [], selfNotes: [], messages: [] };

const continuationNote =
  'An interrupt stopped your last turn before its work was done. Continue the work that is not done yet.';

export async function readTurnContext(
  run: TurnContextRun,
  query: TurnContextQuery,
): Promise<TurnContext> {
  const frame = run.frame;
  const readMemory = run.memory;
  const memory = readMemory?.() ?? null;

  const lines = {
    ownerName: run.memorySettings.ownerName,
    defaultZone: run.defaultZone,
    now: new Date(run.context.clock.now()),
  };

  const core = memory === null ? [] : await memory.readPinnedCore();

  const retrieval =
    readMemory === undefined
      ? noRetrieval
      : await readTurnRetrieval({ ...run, memory: readMemory }, query, lines);

  const at = formatMessageTime(lines.now, null, lines);
  const pinnedMemory = memory === null ? null : renderPinnedMemory(core, lines);
  const changes = memory === null ? null : await readCoreChanges(memory, query, { core, lines });

  return {
    systemPrompt: renderSessionPrompt(frame, {
      taskID: query.taskID,
      persona: query.persona,
      skillCatalog: query.skillCatalog,
      ownerName: lines.ownerName,
      messaging: run.messaging,
      prompts: query.prompts,
    }),
    pinnedMemory,
    preamble: renderTurnPreamble(
      {
        continuation: query.isContinuation ? continuationNote : null,
        changes,
        retrieval,
        thread: query.taskID,
        at,
        brief: pickPreambleBrief(run, query, lines),
      },
      lines,
    ),
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

// A brief that the release before wrote sits in no inbox record, so the first turn carries it as
// the last block of its preamble.
function pickPreambleBrief(
  run: Pick<ConversationRun, 'messaging'>,
  query: TurnContextQuery,
  lines: MemoryLineOptions,
): string | null {
  return query.brief?.origin === 'created' && query.isFirstSession
    ? renderBriefEnvelope(query.brief, lines, run.messaging)
    : null;
}

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
