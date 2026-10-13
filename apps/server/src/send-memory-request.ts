interface VersionRef {
  readonly itemID: string;
  readonly version: number;
}

export type MemoryRequest =
  | { readonly command: 'pending' }
  | {
      readonly command: 'approve' | 'reject';
      readonly proposalID: string;
      readonly actionHash: string;

      // an approval's answer to a close match: a revision of that item, or a new item anyway
      readonly revisionOf?: VersionRef;
      readonly ignoreCloseMatch?: boolean;

      // an approval's text in place of the proposal's
      readonly editedText?: string;
    }
  | { readonly command: 'show'; readonly itemID: string }
  | { readonly command: 'edit'; readonly target: VersionRef; readonly text: string }
  | { readonly command: 'retire' | 'restore'; readonly target: VersionRef }
  | { readonly command: 'pin'; readonly itemID: string; readonly isPinned: boolean };

// Sends a memory host command's request through the running server's control socket, and returns
// the server's JSON answer for the command to print. Bun.fetch, because only Bun's own fetch takes
// a Unix socket.
export async function sendMemoryRequest(
  socketPath: string,
  request: MemoryRequest,
): Promise<unknown> {
  const route = buildMemoryRoute(request);
  const response =
    route.body === null
      ? await Bun.fetch(`http://localhost${route.path}`, { unix: socketPath })
      : await Bun.fetch(`http://localhost${route.path}`, {
          method: 'POST',
          unix: socketPath,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(route.body),
        });

  if (!response.ok) {
    const reason = await response.text();

    throw new Error(
      `nixie answered the memory ${request.command} request with ${response.status}: ${reason}`,
    );
  }
  return response.json();
}

// the control socket's route for a request, and its JSON body, or null for a read
function buildMemoryRoute(request: MemoryRequest): {
  readonly path: string;
  readonly body: object | null;
} {
  switch (request.command) {
    case 'pending': {
      return { path: '/memory/proposals', body: null };
    }
    case 'approve':
    case 'reject': {
      return {
        path: `/memory/proposals/${request.command}`,
        body: {
          proposalID: request.proposalID,
          actionHash: request.actionHash,
          ...(request.revisionOf === undefined ? {} : { revisionOf: request.revisionOf }),
          ...(request.ignoreCloseMatch === true ? { ignoreCloseMatch: true } : {}),
          ...(request.editedText === undefined ? {} : { editedText: request.editedText }),
        },
      };
    }
    case 'show': {
      return { path: `/memory/items/${encodeURIComponent(request.itemID)}`, body: null };
    }
    case 'edit': {
      return { path: '/memory/items/edit', body: { ...request.target, text: request.text } };
    }
    case 'retire':
    case 'restore': {
      return { path: `/memory/items/${request.command}`, body: request.target };
    }
  }
  return {
    path: '/memory/items/pin',
    body: { itemID: request.itemID, isPinned: request.isPinned },
  };
}
