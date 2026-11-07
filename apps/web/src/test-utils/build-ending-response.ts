// A stream whose server stops partway errors in the reader, and Bun prints that error from the
// server that relays it, so the relayed body ends after the part it got.
export function buildEndingResponse(response: Response): Response {
  if (response.body === null) {
    return response;
  }

  const reader = response.body.getReader();

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));

      if (chunk.done) {
        controller.close();
      } else {
        controller.enqueue(chunk.value);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });

  return new Response(body, response);
}
