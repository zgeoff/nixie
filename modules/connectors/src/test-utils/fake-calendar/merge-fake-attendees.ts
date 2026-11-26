import { isHidden } from './present-fake-event';

// The attendees after a patch. A patch replaces the array, as Google does, unless it says
// `attendeesOmitted`, which makes it change only the entries it names and keep every other attendee.
export function mergeFakeAttendees(
  stored: readonly unknown[],
  patched: readonly { readonly email: string }[],
  isOmitted: boolean,
): unknown[] {
  if (!isOmitted) {
    return [...patched];
  }

  const emails = new Set(patched.map((attendee) => attendee.email.toLowerCase()));

  const kept = stored.filter(
    (attendee) =>
      isHidden(attendee) ||
      !(
        typeof attendee === 'object' &&
        attendee !== null &&
        'email' in attendee &&
        typeof attendee.email === 'string' &&
        emails.has(attendee.email.toLowerCase())
      ),
  );

  return [...kept, ...patched];
}
