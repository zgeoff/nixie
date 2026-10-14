// What the server answers once a reset finished: when it ran, the last sequence of the old log and
// how many device sessions it kept.
export interface ResetAnswer {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

// The reset host command's request: asks the running server, over its control socket, to reset the
// log and keep the live device sessions. The answer arrives once the reset finished, and the server
// then stops. Bun.fetch, because only Bun's own fetch takes a Unix socket.
export async function sendResetRequest(socketPath: string): Promise<ResetAnswer> {
  const response = await Bun.fetch('http://localhost/reset', { method: 'POST', unix: socketPath });

  if (!response.ok) {
    const reason = await response.text();

    throw new Error(`nixie answered the reset request with ${response.status}: ${reason}`);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the control socket's own reply
  const body = (await response.json()) as {
    readonly resetAt: string;
    readonly lastSequence: number;
    readonly keptSessions: number;
  };

  return {
    resetAt: new Date(body.resetAt),
    lastSequence: body.lastSequence,
    keptSessions: body.keptSessions,
  };
}
