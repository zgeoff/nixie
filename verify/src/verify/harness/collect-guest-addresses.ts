import { z } from 'zod';

const attendeesSchema = z.array(
  z.object({
    email: z.string(),
    self: z.boolean().optional(),
    organizer: z.boolean().optional(),
  }),
);

// The addresses of the guests of a stored event: every attendee but the organizer and the account
// itself. A value that is no attendee list has none.
export function collectGuestAddresses(attendees: unknown): string[] {
  const parsed = attendeesSchema.safeParse(attendees);

  if (!parsed.success) {
    return [];
  }

  return parsed.data
    .filter((attendee) => attendee.self !== true && attendee.organizer !== true)
    .map((attendee) => attendee.email);
}
