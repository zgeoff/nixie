import { buildFakeFileJSON } from './build-fake-file-json';
import type { FakeDrive, StoredFile } from './types';

// The files.list of the fake: the files that match the `q`, the newest first, in pages. It reads
// `trashed = false`, `name contains`, `fullText contains` and `appProperties has`.
export function listFakeFiles(drive: FakeDrive, url: URL): Response {
  const query = url.searchParams.get('q') ?? '';
  const limit = Number(url.searchParams.get('pageSize') ?? 100);
  const token = url.searchParams.get('pageToken');
  const skipped = token === null ? 0 : readEmptyPage(token);

  if (skipped !== null && skipped < drive.emptyListPages) {
    return Response.json({
      files: [],
      nextPageToken: skipped + 1 < drive.emptyListPages ? `empty${String(skipped + 1)}` : '0',
    });
  }

  const offset = Number(token ?? 0);

  const matching = [...drive.files.values()]
    .filter((file) => isMatchingQuery(file, query))
    .toSorted((left, right) => right.modifiedTime.localeCompare(left.modifiedTime));

  const page = matching.slice(offset, offset + limit);
  const next = offset + limit < matching.length ? String(offset + limit) : undefined;

  return Response.json({
    files: page.map((file) => buildFakeFileJSON(file)),
    ...(next === undefined ? {} : { nextPageToken: next }),
  });
}

function readEmptyPage(token: string): number | null {
  return token.startsWith('empty') ? Number(token.slice('empty'.length)) : null;
}

function isMatchingQuery(file: StoredFile, query: string): boolean {
  if (query.includes('trashed = false') && file.isTrashed) {
    return false;
  }

  const term = /name contains '(?<term>(?:\\.|[^'])*)'/u.exec(query)?.groups?.['term'];

  if (term !== undefined) {
    const wanted = term.replaceAll(/\\(?<char>.)/gu, '$<char>').toLowerCase();

    const text = new TextDecoder().decode(file.bytes).toLowerCase();

    if (!file.name.toLowerCase().includes(wanted) && !text.includes(wanted)) {
      return false;
    }
  }

  const property = /appProperties has \{ key='(?<key>[^']+)' and value='(?<value>[^']+)' \}/u.exec(
    query,
  );

  const key = property?.groups?.['key'];
  const value = property?.groups?.['value'];

  return key === undefined || file.appProperties[key] === value;
}
