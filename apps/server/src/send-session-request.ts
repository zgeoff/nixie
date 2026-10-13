export type SessionRequest =
  | { readonly command: 'list' }
  | { readonly command: 'label'; readonly sessionID: string; readonly label: string };

// A session host command's request: lists the live device sessions, or sets the label of one,
// through the running server's control socket. It returns the server's JSON answer for the command
// to print. Bun.fetch, because only Bun's own fetch takes a Unix socket.
export async function sendSessionRequest(
  socketPath: string,
  request: SessionRequest,
): Promise<unknown> {
  const response =
    request.command === 'list'
      ? await Bun.fetch('http://localhost/sessions', { unix: socketPath })
      : await Bun.fetch('http://localhost/sessions/label', {
          method: 'POST',
          unix: socketPath,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionID: request.sessionID, label: request.label }),
        });

  if (!response.ok) {
    const reason = await response.text();

    throw new Error(
      `nixie answered the session ${request.command} request with ${response.status}: ${reason}`,
    );
  }
  return response.json();
}
