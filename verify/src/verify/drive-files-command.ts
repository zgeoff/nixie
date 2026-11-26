import type { HttpClient } from '@wringer/http';
import { z } from 'zod';
import { controlRoutes } from './harness/control-routes';
import { pickDriveFilesRefusal } from './pick-drive-files-refusal';
import { postControl } from './post-control';
import { refuseHarnessless } from './refuse-harnessless';
import { throwRefusal } from './throw-refusal';

const argsSchema = z.strictObject({
  name: z.string().min(1),
  text: z.string().min(1).optional(),
});

interface DriveFilesContext {
  readonly target: string;
  readonly drivers: { readonly http: HttpClient };
}

// The `drive files` command reads the files that the fake Drive holds, and fails with
// `check-failed` unless exactly one is named --name and, when --text is given, holds that text.
export const driveFilesCommand = {
  path: ['drive', 'files'],
  summary: 'Check that the fake Drive holds one file named --name, with the text --text',
  effect: 'read',
  args: argsSchema,
  data: controlRoutes.driveFiles.output,
  run: async (args: z.output<typeof argsSchema>, ctx: DriveFilesContext) => {
    refuseHarnessless(ctx.target, 'drive files');

    const read = await postControl(ctx.drivers.http, controlRoutes.driveFiles, {});

    throwRefusal(pickDriveFilesRefusal(read.files, args), read);

    return read;
  },
} as const;
