import { readCallContext } from '../gmail/read-call-context';
import type { GmailAccess } from '../gmail/types';
import type { GoogleHosts } from '../google-hosts';
import { readDriveFile } from './read-drive-file';

export interface PickedFile {
  readonly file: string;

  // null when nixie cannot see the file
  readonly name: string | null;
  readonly isVisible: boolean;
}

interface PickedFilesDeps {
  readonly hosts: GoogleHosts;
  readonly access: Pick<GmailAccess, 'readLiveContexts'>;
}

// Checks each file that the owner picked in the browser, by reading it with the connection's own
// token. A file that nixie cannot read, such as one picked under another Google account, comes back
// as not visible. Null when the connection is not live.
export async function readPickedFiles(
  deps: PickedFilesDeps,
  connection: string,
  files: readonly string[],
): Promise<PickedFile[] | null> {
  const context = await readCallContext(deps.access, { connection });

  if (context === null) {
    return null;
  }

  return Promise.all(
    files.map(async (file): Promise<PickedFile> => {
      const read = await readDriveFile(deps.hosts, context, file);

      return read.kind === 'file'
        ? { file, name: read.file.name, isVisible: true }
        : { file, name: null, isVisible: false };
    }),
  );
}
