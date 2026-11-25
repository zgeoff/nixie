export interface ContentType {
  readonly type: string;
  readonly parameters: ReadonlyMap<string, string>;
}

// Reads a Content-Type or Content-Disposition value into its type and its parameters.
export function parseContentType(value: string | undefined): ContentType {
  const [type = '', ...rest] = (value ?? '').split(';');

  const parameters = new Map<string, string>();

  for (const part of rest) {
    const equals = part.indexOf('=');

    if (equals > 0) {
      const name = part.slice(0, equals).trim().toLowerCase();

      parameters.set(
        name,
        part
          .slice(equals + 1)
          .trim()
          .replaceAll(/^"|"$/gu, ''),
      );
    }
  }

  return { type: type.trim().toLowerCase(), parameters };
}
