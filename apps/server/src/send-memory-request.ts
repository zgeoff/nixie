export type MemoryRequest =
  | { readonly command: 'pending' }
  | {
      readonly command: 'approve' | 'reject';
      readonly proposalID: string;
      readonly actionHash: string;

      // an approval's answer to a close match: a revision of that item, or a new item anyway
      readonly revisionOf?: { readonly itemID: string; readonly version: number };
      readonly ignoreCloseMatch?: boolean;
    };

// A memory host command's request: lists the pending memory proposals, or answers one, through the
// running server's control socket. It returns the server's JSON answer for the command to print.
// Bun.fetch, because only Bun's own fetch takes a Unix socket.
export async function sendMemoryRequest(
  socketPath: string,
  request: MemoryRequest,
): Promise<unknown> {
  const response =
    request.command === 'pending'
      ? await Bun.fetch('http://localhost/memory/proposals', { unix: socketPath })
      : await Bun.fetch(`http://localhost/memory/proposals/${request.command}`, {
          method: 'POST',
          unix: socketPath,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            proposalID: request.proposalID,
            actionHash: request.actionHash,
            ...(request.revisionOf === undefined ? {} : { revisionOf: request.revisionOf }),
            ...(request.ignoreCloseMatch === true ? { ignoreCloseMatch: true } : {}),
          }),
        });

  if (!response.ok) {
    const reason = await response.text();

    throw new Error(
      `nixie answered the memory ${request.command} request with ${response.status}: ${reason}`,
    );
  }
  return response.json();
}
