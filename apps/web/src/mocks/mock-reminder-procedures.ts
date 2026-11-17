// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { mockViewStore } from './mock-view-store';
import { requireMockSession } from './require-mock-session';

const reminders = mockImplementer.reminders;

export const mockReminderProcedures = {
  list: reminders.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const listed = mockViewStore.reminders.all().flatMap((entry) =>
      entry.state === 'cancelled'
        ? []
        : [
            {
              reminder: entry.reminder,
              name: entry.name,
              note: entry.note,
              trigger: structuredClone(entry.trigger),
              rendered: entry.rendered,
              state: entry.state,
              next: entry.next,
              recentFires: [...entry.recentFires],
            },
          ],
    );

    return { reminders: listed };
  }),

  cancel: reminders.cancel.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const found = mockViewStore.reminders.findFirst((query) =>
      query.where((entry) => entry.reminder === options.input.reminder),
    );

    if (found === undefined) {
      throw options.errors.NOT_FOUND();
    }

    if (found.state !== 'active') {
      throw options.errors.NOT_ACTIVE();
    }

    await mockViewStore.reminders.update(found, {
      data: (draft) => {
        draft.state = 'cancelled';
      },
    });

    return { reminder: found.reminder };
  }),
};
