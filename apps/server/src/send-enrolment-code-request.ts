import type { EnrolmentCode } from './start-control-socket';

// The enrol-code host command's request: asks the running server, over its control socket, for a
// code that signs one device in. Bun.fetch, because only Bun's own fetch takes a Unix socket.
export async function sendEnrolmentCodeRequest(socketPath: string): Promise<EnrolmentCode> {
  const response = await Bun.fetch('http://localhost/enrolment-codes', {
    method: 'POST',
    unix: socketPath,
  });

  if (!response.ok) {
    const reason = await response.text();

    throw new Error(`nixie answered the enrolment code request with ${response.status}: ${reason}`);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the control socket's own reply
  const body = (await response.json()) as { readonly code: string; readonly expiresAt: string };

  return { code: body.code, expiresAt: new Date(body.expiresAt) };
}
