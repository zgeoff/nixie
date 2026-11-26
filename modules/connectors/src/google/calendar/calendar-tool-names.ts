// The model's names for the Calendar tools.
export const calendarToolNames = {
  listCalendars: 'calendar.list_calendars',
  listEvents: 'calendar.list_events',
  readEvent: 'calendar.read_event',
  createEvent: 'calendar.create_event',
  createEventWithGuests: 'calendar.create_event_with_guests',
  changeEvent: 'calendar.change_event',
  changeEventWithGuests: 'calendar.change_event_with_guests',
  cancelEvent: 'calendar.cancel_event',
  cancelEventWithGuests: 'calendar.cancel_event_with_guests',
  respond: 'calendar.respond',
} as const;

// The read-only check that only the action queue calls.
export const calendarCheckName = 'calendar.find_change';
export const calendarEventsScope = 'calendar.events';
export const calendarListScope = 'calendar.calendarlist.readonly';
