// A newer process raised the writer epoch, so this process lost the right to write and must exit.
export class StaleWriterError extends Error {
  override readonly name = 'StaleWriterError';

  constructor(epoch: number, stored: number | undefined) {
    super(`writer epoch ${epoch} is stale: the database holds writer epoch ${stored ?? 'none'}`);
  }
}
