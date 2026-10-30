export type CappedBody =
  | { kind: 'read'; body: Uint8Array<ArrayBuffer> }
  | { kind: 'too-large' }
  | { kind: 'too-slow' };

// Reads a request body up to a byte limit, and stops reading as soon as it passes the limit, so a
// caller never holds more than the limit in memory. A declared length over the limit stops it
// before the first byte, and the deadline stops a sender that trickles its body.
export async function readCappedBody(
  request: Request,
  maxBytes: number,
  deadline: AbortSignal,
): Promise<CappedBody> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    return { kind: 'too-large' };
  }

  if (request.body === null) {
    return { kind: 'read', body: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const stopReading = () => void reader.cancel().catch(() => {});

  if (deadline.aborted) {
    stopReading();

    return { kind: 'too-slow' };
  }

  deadline.addEventListener('abort', stopReading, { once: true });

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));

    if (deadline.aborted) {
      return { kind: 'too-slow' };
    }

    if (done || value === undefined) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      deadline.removeEventListener('abort', stopReading);
      stopReading();

      return { kind: 'too-large' };
    }

    chunks.push(value);
  }

  deadline.removeEventListener('abort', stopReading);

  const body = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { kind: 'read', body };
}
