import { z } from 'zod';

const timeSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });
const attendeeSchema = z.object({ email: z.string() }).loose();
const privateSchema = z.record(z.string(), z.string().nullable());

// The body of an insert or a patch, with the fields the fake reads. A null private property deletes
// it, as Google does.
export const fakeEventBodySchema = z
  .object({
    id: z.string().optional(),
    summary: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    start: timeSchema.optional(),
    end: timeSchema.optional(),
    attendees: z.array(attendeeSchema).optional(),
    extendedProperties: z.object({ private: privateSchema.optional() }).optional(),
  })
  .loose();
