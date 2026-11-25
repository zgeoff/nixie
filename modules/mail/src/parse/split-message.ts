export interface SplitMessage {
  readonly head: string;
  readonly body: string;
}

// Splits a message, or a part of one, at its first blank line.
export function splitMessage(text: string): SplitMessage {
  const match = /\r?\n\r?\n/u.exec(text);

  if (match === null) {
    return { head: text, body: '' };
  }

  return { head: text.slice(0, match.index), body: text.slice(match.index + match[0].length) };
}
