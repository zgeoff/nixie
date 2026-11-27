import { z } from 'zod';
import { buildEventTime } from './build-event-time';
import { normalizeAddress } from './normalize-address';

const guestAddress = z
  .string()
  .regex(/^[^\s@,;<>]+@[^\s@,;<>]+$/u)
  .transform(normalizeAddress);

const guestList = z.array(guestAddress).max(100);
const time = z.string().refine((value) => buildEventTime(value) !== null);

const create = z.strictObject({
  calendar: z.string().min(1).exactOptional(),
  title: z.string().min(1).max(1000),
  start: time,
  end: time,
  location: z.string().max(1000).exactOptional(),
  description: z.string().max(20_000).exactOptional(),
  connection: z.string().exactOptional(),
});

// A field that is null or absent stays as it is. `start` and `end` change together.
const change = z
  .strictObject({
    event: z.string(),
    title: z.string().min(1).max(1000).nullable().exactOptional(),
    start: time.nullable().exactOptional(),
    end: time.nullable().exactOptional(),
    location: z.string().max(1000).nullable().exactOptional(),
    description: z.string().max(20_000).nullable().exactOptional(),
    addGuests: guestList.exactOptional(),
    removeGuests: guestList.exactOptional(),
    connection: z.string().exactOptional(),
  })
  .refine(
    (value) => {
      const hasStart = value.start !== undefined && value.start !== null;
      const hasEnd = value.end !== undefined && value.end !== null;

      return hasStart === hasEnd;
    },
    { message: 'start and end change together' },
  );

// The arguments of each Calendar tool that takes some, as the queue stores them.
export const calendarArgumentsSchema = {
  create,
  createWithGuests: create.extend({ guests: guestList.min(1) }),
  change,
  cancel: z.strictObject({ event: z.string(), connection: z.string().exactOptional() }),
  respond: z.strictObject({
    event: z.string(),
    response: z.enum(['accepted', 'declined', 'tentative']),
    connection: z.string().exactOptional(),
  }),
};
