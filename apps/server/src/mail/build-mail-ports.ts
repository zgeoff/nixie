import { buildMailFileReader } from '@heynixie/api';
import { buildStoredFile, writeLinkTags, writeLinkedText } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { MailPorts } from '@heynixie/mail';

// What the mail module takes from the web tools and the code files: the link IDs of a session and
// the files of a thread.
export function buildMailPorts(log: Log): MailPorts {
  return {
    ...buildMailFileReader(log),
    buildStoredFile,
    writeLinkTags: (run, request) => writeLinkTags(log, run, request),
    writeLinkedText: (run, request) => writeLinkedText(log, run, request),
  };
}
