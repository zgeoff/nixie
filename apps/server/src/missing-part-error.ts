// A part declares a part it needs or uses that no declaration names, or reads a part its own
// declaration leaves out, so the start order cannot hold.
export class MissingPartError extends Error {
  override readonly name = 'MissingPartError';

  constructor(part: string, missing: string) {
    super(`part ${part} reads part ${missing}, which its declarations leave out`);
  }
}
