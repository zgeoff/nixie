import { expect } from 'bun:test';

// Matches the seal that a mail tool puts around a text from outside, for any fence, so a test names
// the text and the source and leaves the random fence open.
export function matchOutsideText(text: string): string {
  const body = JSON.stringify(text).replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return expect.stringMatching(
    new RegExp(
      `^<tool-result source="untrusted" fence="(?<fence>[0-9a-f]{12})">\\n${body}\\n</tool-result fence="\\k<fence>">$`,
      'u',
    ),
  );
}
