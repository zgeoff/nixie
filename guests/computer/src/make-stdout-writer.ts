// Bun.write on stdout can resolve with part of a large buffer still unwritten when the pipe is
// full, and the next write then lands inside it. One sink keeps every byte in order.
export function makeStdoutWriter(): (bytes: Uint8Array) => Promise<void> {
  const sink = Bun.stdout.writer();

  return async (bytes) => {
    await sink.write(bytes);
    await sink.flush();
  };
}
