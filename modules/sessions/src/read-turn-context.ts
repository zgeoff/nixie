import type { LogRecord } from '@heynixie/log';
import type { PromptOverrides } from '@heynixie/prompts';
import type { TaskReport } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { formatMessageTime } from './format-message-time';
import { isCoreChanged } from './is-core-changed';
import type { TurnRetrieval } from './read-turn-retrieval';
import { readTurnRetrieval } from './read-turn-retrieval';
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
  SessionFrame,
} from './types';

export interface TurnContextQuery {
  readonly taskID: string;

  readonly persona: string;
  readonly prompts: PromptOverrides;
  readonly skillCatalog: string | null;

  readonly batch: readonly LogRecord[];
  readonly previousCore: readonly MemoryRef[] | null;

  readonly isNewSession: boolean;

  readonly isFirstSession: boolean;
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
        start: pickStartNote(frame, query),
        changes,
        retrieval,
        thread: query.taskID,
        at,
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

// A started task opens its first session with no message in its inbox, so this note gives the
// turn its input.
function pickStartNote(frame: SessionFrame, query: TurnContextQuery): string | null {
  return match(frame)
    .with({ kind: 'conversation' }, () => null)
    .with({ kind: 'task' }, (task) =>
      query.isFirstSession ? renderTaskStartNote(task.startedBy, task.report) : null,
    )
    .exhaustive();
}

function renderTaskStartNote(startedBy: string, report: TaskReport): string {
  const start = 'Your task starts now: do what the brief in your instructions asks.';

  return match(report)
    .with(
      'wake',
      'next_turn',
      () =>
        `${start} When you have the result, send it with task.message to ${startedBy}, the task that started you, with the kind report.`,
    )
    .with(
      'none',
      () =>
        `${start} The task that started you, ${startedBy}, asked for no report, so send it none.`,
    )
    .exhaustive();
}

function toMemoryRef(item: MemoryItem): MemoryRef {
  return { itemID: item.itemID, version: item.version };
}
