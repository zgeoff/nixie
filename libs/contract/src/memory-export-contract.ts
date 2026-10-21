import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const checkedExport = signedIn.errors(reusedIDErrors).errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
});

const exportEvent = z.union([
  z.object({ chunk: z.string() }),
  z.object({ isComplete: z.literal(true) }),
]);

const exportEvents = eventIterator(exportEvent);

export const memoryExportContract = {
  export: checkedExport.input(z.object({ clientActionID: z.uuid() })).output(exportEvents),
};
