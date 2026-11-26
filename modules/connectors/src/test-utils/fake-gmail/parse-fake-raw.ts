export interface FakePart {
  readonly partID: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly headers: readonly (readonly [string, string])[];

  // the part's bytes, which a read answers inline or by attachment ID
  readonly bytes: Uint8Array;
  readonly parts: readonly FakePart[];
}

export interface FakeParsed {
  readonly headers: readonly (readonly [string, string])[];
  readonly root: FakePart;
}

// Reads the MIME message that a send or a draft wrote, as far as the fake Gmail needs: the headers,
// and a tree of parts with their decoded bytes.
export function parseFakeRaw(raw: string): FakeParsed {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const entity = parseEntity(text, '0');

  return { headers: entity.headers, root: entity.part };
}

interface Entity {
  readonly headers: readonly (readonly [string, string])[];
  readonly part: FakePart;
}

function parseEntity(text: string, partID: string): Entity {
  const split = text.indexOf('\r\n\r\n');
  const head = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? '' : text.slice(split + 4);

  const headers = unfold(head).map((line): readonly [string, string] => {
    const colon = line.indexOf(':');

    return [line.slice(0, colon), line.slice(colon + 1).trim()];
  });

  const contentType = findHeader(headers, 'content-type') ?? 'text/plain';
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? 'text/plain';
  const boundary = /boundary="?(?<boundary>[^";]+)"?/iu.exec(contentType)?.groups?.['boundary'];

  if (mimeType.startsWith('multipart/') && boundary !== undefined) {
    const parts = splitParts(body, boundary).map(
      (part, index) => parseEntity(part, buildChildID(partID, index)).part,
    );

    return {
      headers,
      part: { partID, mimeType, filename: '', headers, bytes: new Uint8Array(0), parts },
    };
  }

  const disposition = findHeader(headers, 'content-disposition') ?? '';
  const filename = /filename="(?<name>[^"]*)"/iu.exec(disposition)?.groups?.['name'] ?? '';
  const isBase64 = findHeader(headers, 'content-transfer-encoding')?.toLowerCase() === 'base64';

  return {
    headers,
    part: {
      partID,
      mimeType,
      filename,
      headers,
      bytes: new Uint8Array(toBytes(body, isBase64)),
      parts: [],
    },
  };
}

function unfold(head: string): string[] {
  return head.split('\r\n').reduce<string[]>((lines, line) => {
    if (/^[ \t]/u.test(line) && lines.length > 0) {
      lines[lines.length - 1] += ` ${line.trim()}`;
    } else if (line !== '') {
      lines.push(line);
    }

    return lines;
  }, []);
}

function findHeader(
  headers: readonly (readonly [string, string])[],
  name: string,
): string | undefined {
  return headers.find(([key]) => key.toLowerCase() === name)?.[1];
}

function splitParts(body: string, boundary: string): string[] {
  return body
    .split(`--${boundary}`)
    .slice(1)
    .filter((piece) => !piece.startsWith('--'))
    .map((piece) => piece.replace(/^\r\n/u, '').replace(/\r\n$/u, ''));
}

function buildChildID(parentID: string, index: number): string {
  return parentID === '0' ? String(index) : `${parentID}.${String(index)}`;
}

function toBytes(body: string, isBase64: boolean): Buffer {
  return isBase64 ? Buffer.from(body.replaceAll(/\s+/gu, ''), 'base64') : Buffer.from(body);
}
