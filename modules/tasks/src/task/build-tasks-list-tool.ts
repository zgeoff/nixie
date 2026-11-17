import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import { z } from 'zod';
import type { TaskMessaging, TasksContext } from '../types';
import type { ListedTaskState } from './pick-listed-task-state';
import { pickListedTaskState } from './pick-listed-task-state';
import { readListedNextRun } from './read-listed-next-run';
import { readTaskDirectory } from './read-task-directory';
import type { ListedTask } from './read-task-list';
import { readTaskList } from './read-task-list';

const listArguments = z.object({
  state: z.enum(['active', 'waiting', 'done', 'all']).optional(),
  limit: z.int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  taskID: z.string().optional(),
});

type TaskListFilter = NonNullable<z.infer<typeof listArguments>['state']>;

const listedStates: Readonly<Record<TaskListFilter, readonly ListedTaskState[]>> = {
  active: ['ready', 'running'],
  waiting: ['waiting', 'idle', 'asleep', 'paused', 'stopped'],
  done: ['finished', 'done', 'failed', 'closed'],
  all: [
    'ready',
    'running',
    'waiting',
    'idle',
    'asleep',
    'paused',
    'stopped',
    'finished',
    'done',
    'failed',
    'closed',
  ],
};

export function buildTasksListTool(
  context: Pick<TasksContext, 'log' | 'readDefinitionNextFire' | 'readDefinitionVersion'>,
  messaging: Pick<TaskMessaging, 'directory'>,
): ToolDefinition {
  return {
    name: 'tasks.list',
    description:
      'Lists the other tasks you can message with task.message, the most recently active first: ' +
      "each task's ID, name, state, model, brief and last activity, and the ID of the task it " +
      'waits on for a reply, and whether it is wakeable. A task is waiting while it waits on a ' +
      'reply, idle when it waits for a message, asleep when no message wakes it and it waits ' +
      'for its next run, which nextRunAt gives when it has a schedule, and finished once it ' +
      'sent its report and waits for nothing more. Pass state to list only active, waiting ' +
      'or done tasks: waiting also lists idle, asleep, paused and stopped tasks, and done also ' +
      'lists finished, failed and closed ones. A disposable task closes once it reports, and a ' +
      'kept one stays finished until you close it with task.close. A listed brief is only its ' +
      'first line, clipped to 200 characters, and isBriefClipped says when text was left out. ' +
      'A page ends when the next task would pass the output limit, or at limit tasks; when ' +
      'nextCursor is present, pass it as cursor to get the next page, and start again with no ' +
      'cursor for a fresh view, because a task that changed between pages moves to the top. ' +
      'Pass taskID to get that one task with its whole brief, whatever state, limit or cursor ' +
      'you pass.',
    input: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['active', 'waiting', 'done', 'all'] },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        cursor: { type: 'string', description: 'the nextCursor of the page before' },
        taskID: { type: 'string', description: 'the one task to show with its whole brief' },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              state: { type: 'string' },
              model: {
                type: ['string', 'null'],
                description: 'the model the task runs on; null for the usual one',
              },
              brief: { type: 'string' },
              isBriefClipped: {
                type: 'boolean',
                description: 'the brief runs on past what is shown; taskID gives it whole',
              },
              lastActivityAt: { type: 'string', description: 'in UTC' },
              wakeable: { type: 'boolean', description: 'whether a message wakes the task' },
              nextRunAt: {
                type: 'string',
                description:
                  'the next scheduled run, in UTC; only on an asleep task with a schedule',
              },
              waitingOn: { type: 'string', description: 'the task this one waits on' },
            },
            required: [
              'id',
              'name',
              'state',
              'model',
              'brief',
              'isBriefClipped',
              'lastActivityAt',
              'wakeable',
            ],
            additionalProperties: false,
          },
        },
        nextCursor: {
          type: 'string',
          description: 'pass as cursor for the next page; absent on the last page',
        },
      },
      required: ['tasks'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { tasks: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, tool) => {
      const input = listArguments.parse(call.input);

      const directory = await readTaskDirectory(context, messaging);

      if (input.taskID !== undefined) {
        const [task] = await readTaskList(context, directory, {
          callerID: tool.run.thread,
          taskIDs: [input.taskID],
        });

        if (task === undefined) {
          return {
            status: 'error',
            message: `no task you can list has the ID ${input.taskID}; call tasks.list with no taskID to see the IDs`,
          };
        }

        const state = pickListedTaskState(task);

        const nextRunAt = await readListedNextRun(context, task, state);

        return {
          status: 'ok',
          result: {
            tasks: [
              toTaskJSON(task, state, nextRunAt, {
                brief: task.brief,
                isBriefClipped: false,
              }),
            ],
          },
        };
      }

      const after = input.cursor === undefined ? null : parseCursor(input.cursor);

      if (input.cursor !== undefined && after === null) {
        return {
          status: 'error',
          message: 'that cursor is not one tasks.list gave; call tasks.list again with no cursor',
        };
      }

      const tasks = await readTaskList(context, directory, {
        callerID: tool.run.thread,
      });

      const states = listedStates[input.state ?? 'all'];

      const candidates = tasks
        .filter((task) => after === null || isAfterCursor(task, after))
        .map((task) => ({ task, state: pickListedTaskState(task) }))
        .filter((entry) => states.includes(entry.state));

      const page = await fillPage(context, candidates, input.limit ?? candidates.length);

      const last = page.entries.at(-1);

      return {
        status: 'ok',
        result: {
          tasks: page.entries.map((entry) => entry.json),
          ...(page.hasMore && last !== undefined ? { nextCursor: buildCursor(last.task) } : {}),
        },
      };
    },
  };
}

interface BriefView {
  readonly brief: string;
  readonly isBriefClipped: boolean;
}

function toTaskJSON(
  task: ListedTask,
  state: ListedTaskState,
  nextRunAt: string | null,
  view: BriefView,
): JSONObject {
  return {
    id: task.id,
    name: task.name,
    state,
    model: task.model,
    brief: view.brief,
    isBriefClipped: view.isBriefClipped,
    lastActivityAt: task.lastActivityAt.toISOString(),
    wakeable: task.wakeable,
    ...(nextRunAt === null ? {} : { nextRunAt }),
    ...(task.waitingOn === undefined ? {} : { waitingOn: task.waitingOn }),
  };
}

interface ListCursor {
  readonly sequence: number;
  readonly taskID: string;
}

function parseCursor(cursor: string): ListCursor | null {
  try {
    const parsed = z
      .tuple([z.int(), z.string()])
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));

    return { sequence: parsed[0], taskID: parsed[1] };
  } catch {
    return null;
  }
}

// the list order is the updated sequence descending, then the task ID descending
function isAfterCursor(task: ListedTask, cursor: ListCursor): boolean {
  return (
    task.updatedSequence < cursor.sequence ||
    (task.updatedSequence === cursor.sequence && task.id < cursor.taskID)
  );
}

interface Candidate {
  readonly task: ListedTask;
  readonly state: ListedTaskState;
}

interface PageEntry {
  readonly task: ListedTask;
  readonly json: JSONObject;
}

// the room that the keys of the result and a cursor take
const envelopeBytes = 200;

// A page fills to the byte budget of a recall page, so it stays inside the tool output limit.
const listPageBudgetBytes = recallPageLimitBytes;

// Fills a page in list order until the next entry would pass the byte budget or the cap. A page
// always holds one entry, and reads the next run of the entries it shows only.
async function fillPage(
  context: Pick<TasksContext, 'log' | 'readDefinitionNextFire'>,
  candidates: readonly Candidate[],
  cap: number,
): Promise<{ readonly entries: readonly PageEntry[]; readonly hasMore: boolean }> {
  const entries: PageEntry[] = [];
  let bytes = envelopeBytes;

  for (const candidate of candidates) {
    if (entries.length >= cap) {
      break;
    }

    const nextRunAt = await readListedNextRun(context, candidate.task, candidate.state);

    const json = toTaskJSON(
      candidate.task,
      candidate.state,
      nextRunAt,
      clipBrief(candidate.task.brief),
    );

    const size = Buffer.byteLength(JSON.stringify(json)) + 1;

    if (entries.length > 0 && bytes + size > listPageBudgetBytes) {
      break;
    }

    entries.push({ task: candidate.task, json });

    bytes += size;
  }

  return { entries, hasMore: entries.length < candidates.length };
}

const briefClipLength = 200;

// The first line of the brief, trimmed and cut to the clip length with a trailing ellipsis.
function clipBrief(brief: string): BriefView {
  const trimmed = brief.trim();
  const firstLine = (trimmed.split(/\r?\n/u)[0] ?? '').trim();
  const characters = [...firstLine];

  if (characters.length > briefClipLength) {
    return { brief: `${characters.slice(0, briefClipLength).join('')}…`, isBriefClipped: true };
  }

  return { brief: firstLine, isBriefClipped: firstLine !== trimmed };
}

function buildCursor(task: ListedTask): string {
  return Buffer.from(JSON.stringify([task.updatedSequence, task.id])).toString('base64url');
}
