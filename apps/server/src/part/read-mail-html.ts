import type { FetchReply } from '@heynixie/wire';

// Reads a mail's HTML in the fetch sandbox, or answers that it cannot while the sandbox is not
// running, so a Gmail tool reports the mail as unsupported.
export function readMailHTML(
  read: ((html: string) => Promise<FetchReply>) | null,
  html: string,
): Promise<FetchReply> {
  if (read === null) {
    return Promise.resolve({
      kind: 'failed',
      reason: 'the fetch sandbox is not running',
      isGated: false,
    });
  }

  return read(html);
}
