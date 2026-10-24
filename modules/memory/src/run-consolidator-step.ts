import { StaleWriterError } from '@heynixie/log';
import { renderPrompt } from '@heynixie/prompts';
import { renderSessionMessages } from '@heynixie/sessions';
import type { StepInput, StepResult } from '@heynixie/tasks';
import { LeaseLostError } from '@heynixie/tasks';
import type { StagedChange } from './consolidation-types';
import type { ConsolidatorParts } from './consolidator-parts';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { PlannedSummary } from './plan-diff-record';
import { planDiffRecord } from './plan-diff-record';
import { readConsolidationItems } from './read-consolidation-items';
import { renderConsolidatorPrompt } from './render-consolidator-prompt';

export async function runConsolidatorStep(
  parts: ConsolidatorParts,
  input: StepInput,
): Promise<StepResult> {
  const wakes = input.inbox
    .filter((record) => record.kind !== 'task_message')
    .map((record) => record.sequence);

  try {
    const run = await runConsolidation(parts, input);

    return {
      next: run.next,
      records: run.records,
      timers: run.timers,
      acknowledged: run.hasRunSession ? input.inbox.map((record) => record.sequence) : wakes,
    };
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof StaleWriterError) {
      throw error;
    }

    parts.onError(error);

    return {
      next: 'wait',
      records: [],
      acknowledged: wakes,
      timers: [{ dueAt: parts.context.clock.now() + parts.config.retryMs }],
    };
  }
}

interface ConsolidationStep {
  readonly next: StepResult['next'];
  readonly records: StepResult['records'];
  readonly timers: NonNullable<StepResult['timers']>;
  readonly hasRunSession: boolean;
}

async function runConsolidation(
  parts: ConsolidatorParts,
  input: StepInput,
): Promise<ConsolidationStep> {
  const now = parts.context.clock.now();

  const wait = await readWaitTime(parts, now);

  if (wait !== null) {
    return { next: 'wait', records: [], timers: [{ dueAt: wait }], hasRunSession: false };
  }

  const diff = await runSession(parts, input);

  const records = await planDiffRecord(parts.context.log, {
    ...diff,
    now,
    lapseMs: parts.config.lapseMs,
    definitions: parts.context.definitions(),
  });

  return {
    next: 'wait',
    records,
    timers: [{ dueAt: now + parts.config.periodMs }],
    hasRunSession: diff.model !== null,
  };
}

async function readWaitTime(parts: ConsolidatorParts, now: number): Promise<number | null> {
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
  readonly summary: PlannedSummary | null;
}

async function runSession(parts: ConsolidatorParts, input: StepInput): Promise<SessionDiff> {
  const listed = await readConsolidationItems(parts.store, {
    listTokens: parts.config.itemListTokens,
    thread: memoryConsolidatorTaskID,
  });

  if (listed.isComplete && listed.items.length < 2) {
    return { changes: [], model: null, shownItems: listed.items.length, summary: null };
  }

  const staged = parts.staging.open(
    new Map(
      listed.items.map((item) => [
        item.itemID,
        {
          shortID: item.shortID,
          version: item.version,
          text: item.text,
          source: item.source,
          isPinned: item.isPinned,
          subject: item.subject,
        },
      ]),
    ),
    parts.config.maxChanges,
  );

  try {
    await parts.model.runSession({
      systemPrompt: renderPrompt(
        'consolidator',
        {
          persona: parts.getPersona(),
          owner: { name: parts.ownerName },
          memory: { maxChanges: parts.config.maxChanges },
        },
        parts.getPrompts(),
      ),
      prompt: appendTaskMessages(renderConsolidatorPrompt(listed), parts, input),
      signal: input.signal,
    });

    return readSessionDiff(staged, parts.model.model);
  } catch (error) {
    staged.close();
    throw error;
  }
}

function appendTaskMessages(prompt: string, parts: ConsolidatorParts, input: StepInput): string {
  const messages = renderSessionMessages(
    input.inbox,
    { defaultZone: parts.defaultZone, now: new Date(parts.context.clock.now()) },
    { messaging: parts.messaging, wake: input.wake },
  );

  return messages === null
    ? prompt
    : `${prompt}\n\nMessages to you from other tasks:\n\n${messages}`;
}

function readSessionDiff(
  staged: ReturnType<ConsolidatorParts['staging']['open']>,
  model: string,
): SessionDiff {
  const shown = staged.readShownItemIDs();
  const text = staged.readSummary();

  return {
    changes: staged.close() ?? [],
    model,
    shownItems: shown.length,
    summary: text === null ? null : { text, itemIDs: shown },
  };
}
