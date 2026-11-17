import type { Trigger } from '@heynixie/contract';
import type { ListedDefinition } from '@heynixie/definitions';
import { readListedDefinitions, readNewestDefinitionName } from '@heynixie/definitions';
import type { TaskRun, TasksTables } from '@heynixie/tasks';
import { readEndedRuns, readPinnedProfiles, readTaskDirectory } from '@heynixie/tasks';
import {
  buildDayStart,
  readArmedDefinitions,
  readSpentOneShots,
  readTriggerReport,
  renderTrigger,
} from '@heynixie/triggers';
import type { RenderedTrigger, TriggerReportEntry } from '@heynixie/triggers';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readListedTasks } from './read-listed-tasks';
import { readTaskRunFire } from './read-task-run-fire';

export function createViewProcedures(context: APIContext) {
  return {
    tasks: {
      listEnded: apiImplementer.tasks.listEnded.handler(async (options) => {
        await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

        const limit = options.input.limit;
        const before = options.input.before;
        const definitionID = options.input.definitionID;

        const read = await readEndedRuns(context, {
          limit: limit + 1,
          ...(before === undefined ? {} : { beforeSequence: before }),
          ...(definitionID === undefined ? {} : { definitionID }),
        });

        const page = read.slice(0, limit);
        const last = page.at(-1)?.ended ?? null;

        const runs = await Promise.all(page.map((run) => readEndedRun(context, run)));

        return {
          tasks: await readPageTasks(context, page),
          runs: runs.flat(),
          next: read.length > limit && last !== null ? last.sequence : null,
        };
      }),
    },

    triggers: {
      report: apiImplementer.triggers.report.handler(async (options) => {
        await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

        const zone = await context.readZone('owner');

        const db = context.log.writer.db;

        const entries = await readTriggerReport(db, {
          sinceMs: buildDayStart(options.input.since, zone),
          ...(options.input.definitionID === undefined
            ? {}
            : { definitionID: options.input.definitionID }),
        });

        const definitionsInForce = await readListedDefinitions(db);

        const listed = new Map(
          definitionsInForce.map((definition) => [definition.definitionID, definition]),
        );

        const named = [];

        for (const entry of entries) {
          named.push({
            definitionID: entry.definitionID,
            name: await readEntryName(context, entry, listed),
            kind: entry.kind,
            scheduledFor: entry.scheduledFor,
            firedAt: entry.firedAt,
            lateBySeconds: entry.lateBySeconds,
            reason: entry.reason,
            sequence: entry.sequence,
          });
        }

        return { entries: named };
      }),
    },

    definitions: {
      listTasks: apiImplementer.definitions.listTasks.handler(async (options) => {
        await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

        const db = context.log.writer.db;

        const listed = await readListedDefinitions(db);
        const armedRows = await readArmedDefinitions(db, 'schedule');

        const armed = new Map(armedRows.map((row) => [row.definitionID, row]));

        const spent = await readSpentOneShots(
          db,
          listed.flatMap((definition) =>
            definition.trigger === null
              ? []
              : [{ definitionID: definition.definitionID, trigger: definition.trigger }],
          ),
        );

        const bound = await readBoundTasks(context);

        const definitions = [];

        for (const definition of listed) {
          const row = armed.get(definition.definitionID);
          const trigger = definition.trigger;

          const view = await readRenderedTrigger(context, trigger, row?.after);

          definitions.push({
            definitionID: definition.definitionID,
            name: definition.name,
            enabled: definition.enabled,
            target: definition.target,
            trigger,
            rendered: view?.rendered ?? null,
            next:
              row === undefined || spent.has(definition.definitionID) ? null : (view?.next ?? null),
            tools: [...definition.tools],
            origin: definition.origin,
            createdBy: definition.createdBy,
            taskID:
              definition.target === 'task' && definition.enabled
                ? (bound.get(definition.definitionID) ?? null)
                : null,
            isUnreadable: definition.isUnreadable,
          });
        }

        return { definitions };
      }),
    },
  };
}

async function readEndedRun(context: APIContext, run: TaskRun) {
  const ended = run.ended;

  if (ended === null) {
    return [];
  }

  return [
    {
      runID: run.runID,
      taskID: run.taskID,
      definitionID: ended.record.definitionID,
      startedAt: run.startedAt,
      endedAt: ended.endedAt,
      sequence: ended.sequence,
      cause: ended.record.cause,
      endedBy: ended.record.endedBy,
      carriesRunID: ended.record.carriesRunID,
      reportID: ended.record.reportID,
      delivery: ended.record.delivery,
      fire: await readTaskRunFire(context, run),
      used: { turns: ended.record.used.turns, dollars: ended.record.used.dollars },
    },
  ];
}

// One entry per distinct task of the page. A task of a definition that left force, with no open task
// run, is in no directory, so its profile comes from the version that its newest ended task run pins.
// A task with an open task run takes the profile that the task read gives it.
async function readPageTasks(context: APIContext, runs: readonly TaskRun[]) {
  const taskIDs = [...new Set(runs.map((run) => run.taskID))];

  if (taskIDs.length === 0) {
    return [];
  }

  const messaging = await readTaskDirectory(context, {
    directory: context.settings.taskDirectory,
  });

  const knownIDs = new Set(messaging.directory.map((profile) => profile.taskID));

  const missing = taskIDs.filter((taskID) => !knownIDs.has(taskID));

  const pinned = await readPinnedProfiles(context, runs, missing);

  return readListedTasks(context, [...messaging.directory, ...pinned], taskIDs.length, { taskIDs });
}

// A late entry names the version that fired. A skip holds no version, so it takes the name from the
// definition in force, then from the newest stored version, and last the ID.
async function readEntryName(
  context: APIContext,
  entry: TriggerReportEntry,
  listed: ReadonlyMap<string, ListedDefinition>,
): Promise<string> {
  const db = context.log.writer.db;

  const version =
    entry.definitionHash === null
      ? null
      : await context.readDefinitionVersion(db, entry.definitionHash);

  const current = version?.name ?? listed.get(entry.definitionID)?.name;

  if (current !== undefined) {
    return current;
  }

  const stored = await readNewestDefinitionName(db, entry.definitionID);

  return stored ?? entry.definitionID;
}

async function readBoundTasks(context: APIContext): Promise<ReadonlyMap<string, string>> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'definition_id'])
    .where('definition_id', 'is not', null)
    .execute();

  return new Map(
    rows.flatMap((row) =>
      row.definition_id === null ? [] : [[row.definition_id, row.task_id] as const],
    ),
  );
}

// The words and the next date of a trigger in its zone. A definition with no armed row counts from
// now.
async function readRenderedTrigger(
  context: APIContext,
  trigger: Trigger | null,
  afterMs: number | undefined,
): Promise<RenderedTrigger | null> {
  if (trigger === null) {
    return null;
  }

  const zoneName = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await context.readZone(zoneName);

  const after = afterMs ?? context.clock.now();

  return renderTrigger(trigger, after, zone);
}
