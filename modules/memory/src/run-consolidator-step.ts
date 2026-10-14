import { StaleWriterError } from '@heynixie/log';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { LeaseLostError } from '@heynixie/tasks';
import type { StagedChange } from './consolidation-types';
import type { ConsolidatorParts } from './consolidator-parts';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import { planDiffRecord } from './plan-diff-record';
import { readConsolidationItems } from './read-consolidation-items';
import { renderConsolidatorPrompt } from './render-consolidator-prompt';
import { renderConsolidatorSystemPrompt } from './render-consolidator-system-prompt';

// Runs one step of the memory consolidator: once a period has passed and no change still waits,
// it runs one session over the active items and commits the diff as one record with the step. A
// failed run waits the retry time and never throws, so the task never fails.
export async function runConsolidatorStep(
  parts: ConsolidatorParts,
  input: StepInput,
): Promise<StepResult> {
  const acknowledged = input.inbox.map((record) => record.sequence);

  try {
    return { ...(await runConsolidation(parts, input.signal)), acknowledged };
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }
    parts.onError(error);
    return {
      next: 'wait',
      records: [],
      acknowledged,
      timers: [{ dueAt: parts.context.clock.now() + parts.config.retryMs }],
    };
  }
}

type ConsolidationStep = Omit<StepResult, 'acknowledged'>;

// A diff that still waits holds the next run until its last change is answered or lapses, so you
// never hold 2 diffs that change the same items.
async function runConsolidation(
  parts: ConsolidatorParts,
  signal: AbortSignal,
): Promise<ConsolidationStep> {
  const now = parts.context.clock.now();
  const wait = await findWaitTime(parts, now);

  if (wait !== null) {
    return { next: 'wait', records: [], timers: [{ dueAt: wait }] };
  }
  const diff = await runSession(parts, signal);
  const record = await planDiffRecord(parts.context.log, {
    ...diff,
    now,
    lapseMs: parts.config.lapseMs,
    definitions: parts.context.definitions(),
  });

  return { next: 'wait', records: [record], timers: [{ dueAt: now + parts.config.periodMs }] };
}

// when the next run is due, or null when it is due now; a pending change holds it until it lapses
async function findWaitTime(parts: ConsolidatorParts, now: number): Promise<number | null> {
  await parts.store.consolidations.lapse();

  const schedule = await parts.store.consolidations.readSchedule();
  const due = schedule.lastRunAt === null ? now : schedule.lastRunAt + parts.config.periodMs;

  if (schedule.nextLapseAt !== null) {
    return Math.max(due, schedule.nextLapseAt);
  }
  return now < due ? due : null;
}

interface SessionDiff {
  readonly changes: readonly StagedChange[];
  readonly model: string | null;
  readonly shownItems: number;
}

// Fewer than 2 active items leave nothing to merge and little to tidy, so that run needs no
// session. The run closes whether the session ends or fails, so a failed run leaves nothing staged.
async function runSession(parts: ConsolidatorParts, signal: AbortSignal): Promise<SessionDiff> {
  const listed = await readConsolidationItems(parts.store, {
    listTokens: parts.config.itemListTokens,
    thread: memoryConsolidatorTaskID,
  });

  if (listed.items.length < 2) {
    return { changes: [], model: null, shownItems: listed.items.length };
  }
  const staged = parts.staging.open(
    new Map(
      listed.items.map((item) => [
        item.itemID,
        { version: item.version, text: item.text, source: item.source, isPinned: item.isPinned },
      ]),
    ),
    parts.config.maxChanges,
  );

  try {
    await parts.model.runSession({
      systemPrompt: renderConsolidatorSystemPrompt(parts.getPersona(), parts.config.maxChanges),
      prompt: renderConsolidatorPrompt(listed),
      signal,
    });

    const shownItems = staged.countShown();

    return { changes: staged.close() ?? [], model: parts.model.model, shownItems };
  } catch (error) {
    staged.close();
    throw error;
  }
}
