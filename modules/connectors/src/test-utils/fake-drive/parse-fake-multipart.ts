export interface FakeMultipart {
  // the JSON of the first part
  readonly metadata: unknown;
  readonly mediaType: string;
  readonly text: string;
}

// The 2 parts of a multipart/related upload: the metadata as JSON, then the content. Null for a body
// that has not 2 parts.
export function parseFakeMultipart(contentType: string, body: string): FakeMultipart | null {
  const boundary = /boundary=(?<boundary>[^;\s]+)/u.exec(contentType)?.groups?.['boundary'];

  if (boundary === undefined) {
    return null;
  }

  const parts = body
    .split(`--${boundary}`)
    .filter((part) => part.trim() !== '' && part.trim() !== '--')
    .map((part) => part.replace(/^\r\n/u, '').replace(/\r\n$/u, ''));

  const [first, second] = parts;

  if (first === undefined || second === undefined) {
    return null;
  }

  const metadata: unknown = JSON.parse(first.split('\r\n\r\n')[1] ?? '{}');
  const [head = '', ...rest] = second.split('\r\n\r\n');
  const type = /content-type:\s*(?<type>[^;\r\n]+)/iu.exec(head)?.groups?.['type'];

  return { metadata, mediaType: type?.trim() ?? '', text: rest.join('\r\n\r\n') };
}
