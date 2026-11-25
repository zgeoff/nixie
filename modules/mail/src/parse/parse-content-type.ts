import { decodeCharset } from './decode-charset';

export interface ContentType {
  readonly type: string;
  readonly parameters: ReadonlyMap<string, string>;
}

// Reads a Content-Type or Content-Disposition value into its type and its parameters. A quoted value
// keeps its semicolons, and an extended parameter such as `filename*=UTF-8''caf%C3%A9.pdf` takes the
// place of the plain parameter of its name.
export function parseContentType(value: string | undefined): ContentType {
  const [type = '', ...rest] = splitParameters(value ?? '');

  const parameters = new Map<string, string>();
  const extended = new Map<string, string>();

  for (const part of rest) {
    const equals = part.indexOf('=');

    if (equals > 0) {
      const name = part.slice(0, equals).trim().toLowerCase();
      const raw = part.slice(equals + 1).trim();

      if (name.endsWith('*')) {
        extended.set(name.slice(0, -1), decodeExtendedValue(raw));
      } else {
        parameters.set(name, unquote(raw));
      }
    }
  }

  for (const [name, decoded] of extended) {
    parameters.set(name, decoded);
  }

  return { type: type.trim().toLowerCase(), parameters };
}

function splitParameters(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let isQuoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);

    if (char === '\\' && isQuoted) {
      current += value.slice(index, index + 2);
      index += 1;
    } else if (char === '"') {
      isQuoted = !isQuoted;
      current += char;
    } else if (char === ';' && !isQuoted) {
      parts.push(current);

      current = '';
    } else {
      current += char;
    }
  }

  parts.push(current);

  return parts;
}

const extendedValuePattern = /^(?<charset>[^']*)'[^']*'(?<encoded>.*)$/u;

function decodeExtendedValue(raw: string): string {
  const groups = extendedValuePattern.exec(raw)?.groups;

  if (groups === undefined) {
    return unquote(raw);
  }

  const bytes = Buffer.from(
    (groups['encoded'] ?? '').replaceAll(/%(?<hex>[0-9A-Fa-f]{2})/gu, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    ),
    'latin1',
  );

  return decodeCharset(bytes, groups['charset'] ?? '');
}

const quotedValuePattern = /^"(?<inner>(?:[^"\\]|\\.)*)"$/u;

function unquote(raw: string): string {
  const inner = quotedValuePattern.exec(raw)?.groups?.['inner'];

  return inner === undefined ? raw : inner.replaceAll(/\\(?<escaped>.)/gu, '$<escaped>');
}
