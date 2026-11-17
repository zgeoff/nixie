import { withWriteTransaction } from '@heynixie/log';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readReminderByShortID, readReminderList, writeReminderCancel } from '@heynixie/reminders';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

export function createReminderProcedures(context: APIContext) {
  const reminders = apiImplementer.reminders;

  return {
    list: reminders.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const listed = await readReminderList(context.log.writer.db, {
        now: context.clock.now(),
        readZone: context.readZone,
      });

      return {
        reminders: listed.map((reminder) => ({
          reminder: reminder.shortID,
          name: reminder.name,
          note: reminder.note,
          trigger: reminder.trigger,
          rendered: reminder.rendered,
          state: reminder.state === 'fired' ? ('fired' as const) : ('active' as const),
          next: reminder.next,
          recentFires: [...reminder.recentFires],
        })),
      };
    }),

    cancel: reminders.cancel.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const shortID = options.input.reminder;

      const outcome = await withWriteTransaction(context.log.writer, async (tx) => {
        const found = await readReminderByShortID(tx, shortID);

        if (found === null) {
          return 'not_found' as const;
        }

        if (found.state !== 'active') {
          return 'not_active' as const;
        }

        await writeReminderCancel(tx, context, found);

        return 'cancelled' as const;
      });

      if (outcome === 'not_found') {
        throw options.errors.NOT_FOUND();
      }

      if (outcome === 'not_active') {
        throw options.errors.NOT_ACTIVE();
      }

      return { reminder: shortID };
    }),
  };
}
