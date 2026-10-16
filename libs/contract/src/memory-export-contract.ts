import { eventIterator } from '@orpc/contract';
import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const checkedExport = signedIn.errors(reusedIDErrors).errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
});

const chunkEvents = eventIterator(z.object({ chunk: z.string() }));

// The export of every memory item, a checked action that streams the export file's text in order,
// header first. The client joins the chunks into the one JSON file it saves where you pick.
export const memoryExportContract = {
  export: checkedExport.input(z.object({ clientActionID: z.uuid() })).output(chunkEvents),
};
