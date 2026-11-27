import type { StoredEvent } from './types';

// The event as a read shows it: an attendee that the seed hid stays out of the answer, and the
// answer says that attendees were omitted, as Google does for an event with too many attendees.
export function presentFakeEvent(stored: StoredEvent): StoredEvent {
  const attendees = stored['attendees'];

  if (!Array.isArray(attendees) || !attendees.some((attendee) => isHidden(attendee))) {
    return stored;
  }

  return {
    ...stored,
    attendees: attendees.filter((attendee) => !isHidden(attendee)),
    attendeesOmitted: true,
  };
}

export function isHidden(attendee: unknown): boolean {
  return (
    typeof attendee === 'object' &&
    attendee !== null &&
    'hiddenFromReads' in attendee &&
    attendee.hiddenFromReads === true
  );
}
