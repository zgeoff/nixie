export class TextLimitError extends Error {
  override readonly name = 'TextLimitError';

  readonly code = 'TEXT_TOO_LONG';
}
