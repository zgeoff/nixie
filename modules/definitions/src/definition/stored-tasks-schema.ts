import { z } from 'zod';

const storedTaskSchema = z.strictObject({
  id: z.string(),
  hash: z.string(),
  origin: z.literal('definitions'),
});

// A form from before the tasks list holds none.
export const storedTasksSchema = z.looseObject({
  tasks: z.array(storedTaskSchema).default([]),
});
