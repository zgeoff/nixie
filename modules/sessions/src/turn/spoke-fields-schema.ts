import { z } from 'zod';

// The fields of a call's records that a conversation's history reads. The call's own module
// defines the records.
export const spokeFieldsSchema = z.object({ lineID: z.string() });
