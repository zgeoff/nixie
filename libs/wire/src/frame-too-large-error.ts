// A frame announced a payload past the reader's limit per message. The reader stops at the header,
// so it never buffers the oversized payload.
export class FrameTooLargeError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(`a frame of ${size} bytes is past the limit of ${limit} bytes per message`);
    this.name = 'FrameTooLargeError';
    this.size = size;
    this.limit = limit;
  }
}
