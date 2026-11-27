// A Message-ID header without its angle brackets, or null when it holds nothing.
export function stripAngleBrackets(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim().replace(/^</u, '').replace(/>$/u, '');

  return trimmed === '' ? null : trimmed;
}
