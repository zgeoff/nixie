// A live streaming transcript carries no punctuation, so a batch model's full stop or question mark
// would tell a text detector that the turn ended before the person did.
export function toPlainTranscript(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9' ]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
