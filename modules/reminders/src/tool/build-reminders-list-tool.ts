import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import { z } from 'zod';
import type { ListedReminder } from '../reminder/read-reminder-list';
import { readReminderList } from '../reminder/read-reminder-list';
import type { RemindersContext } from '../types';

const listArguments = z.strictObject({ cursor: z.string().optional() });

export function buildRemindersListTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminders.list',
    description:
      'Lists the reminders that wait, and the one-time reminders that fired in the last 24 hours, ' +
      'the newest set first: each ID, name, note, trigger in words, state, next fire and last 3 ' +
      'fires. A page ends when the next reminder would pass the output limit; when nextCursor is ' +
      'present, pass it as cursor to get the next page, and start again with no cursor for a fresh view.',
    input: {
      type: 'object',
      properties: { cursor: { type: 'string', description: 'the nextCursor of the page before' } },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        reminders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              reminder: { type: 'string' },
              name: { type: 'string' },
              note: { type: 'string' },
              trigger: { type: 'string', description: 'the trigger in words' },
              state: { type: 'string', enum: ['active', 'fired'] },
              next: { type: ['string', 'null'], description: 'the next fire, ISO in UTC' },
              recentFires: { type: 'array', items: { type: 'string' } },
            },
            required: ['reminder', 'name', 'note', 'trigger', 'state', 'next', 'recentFires'],
            additionalProperties: false,
          },
        },
        nextCursor: { type: 'string', description: 'pass as cursor for the next page' },
      },
      required: ['reminders'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { reminders: 'owner_data', nextCursor: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = listArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const before = parsed.data.cursor === undefined ? undefined : parseCursor(parsed.data.cursor);

      if (parsed.data.cursor !== undefined && before === null) {
        return {
          status: 'error',
          message:
            'that cursor is not one reminders.list gave; call reminders.list again with no cursor',
        };
      }

      const reminders = await readReminderList(context.log.writer.db, {
        now: context.log.writer.clock.now(),
        readZone: context.readZone,
        beforeSequence: before ?? undefined,
      });

      const page = pickPage(reminders);
      const last = page.at(-1);

      return {
        status: 'ok',
        result: {
          reminders: page.map((reminder) => toJSON(reminder)),
          ...(page.length < reminders.length && last !== undefined
            ? { nextCursor: buildCursor(last) }
            : {}),
        },
      };
    },
  };
}

function parseCursor(cursor: string): number | null {
  try {
    const parsed = z
      .tuple([z.int()])
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));

    return parsed[0];
  } catch {
    return null;
  }
}

// the room that the keys of the result and a cursor take
const envelopeBytes = 200;

// Fills a page in list order until the next entry would pass the byte budget of a recall page. A
// page always holds one entry.
function pickPage(reminders: readonly ListedReminder[]): readonly ListedReminder[] {
  const page: ListedReminder[] = [];
  let bytes = envelopeBytes;

  for (const reminder of reminders) {
    const size = Buffer.byteLength(JSON.stringify(toJSON(reminder))) + 1;

    if (page.length > 0 && bytes + size > recallPageLimitBytes) {
      break;
    }

    page.push(reminder);

    bytes += size;
  }

  return page;
}

function toJSON(reminder: ListedReminder): JSONObject {
  return {
    reminder: reminder.shortID,
    name: reminder.name,
    note: reminder.note,
    trigger: reminder.rendered,
    state: reminder.state === 'fired' ? 'fired' : 'active',
    next: reminder.next,
    recentFires: [...reminder.recentFires],
  };
}

function buildCursor(reminder: ListedReminder): string {
  return Buffer.from(JSON.stringify([reminder.setSequence]), 'utf8').toString('base64url');
}
