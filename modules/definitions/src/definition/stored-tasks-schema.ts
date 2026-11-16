import { z } from 'zod';

const storedTaskSchema = z.discriminatedUnion('origin', [
  z.strictObject({ id: z.string(), hash: z.string(), origin: z.literal('definitions') }),
  z.strictObject({
    id: z.string(),
    hash: z.string(),
    origin: z.literal('nixie'),
    changeID: z.string(),
  }),
]);

// A form from before the tasks list holds none.
export const storedTasksSchema = z.looseObject({
  tasks: z.array(storedTaskSchema).default([]),
});
