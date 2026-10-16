import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const checkedExport = signedIn.errors(reusedIDErrors).errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
});

// each chunk of the file's text, then one event that marks the file complete
const exportEvent = z.union([
  z.object({ chunk: z.string() }),
  z.object({ isComplete: z.literal(true) }),
]);

const exportEvents = eventIterator(exportEvent);

// The export of every memory item, a checked action that streams the export file's text in order,
// header first, then marks it complete. A client keeps the file only after that mark.
export const memoryExportContract = {
  export: checkedExport.input(z.object({ clientActionID: z.uuid() })).output(exportEvents),
};
